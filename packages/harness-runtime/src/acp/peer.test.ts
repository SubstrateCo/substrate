import { startFakeAgent, type FakeAgent, type FakeAgentScript } from "../testing/fake-agent.ts";
import {
  acpAuthRequired,
  type AcpConfigOption,
  type AcpLaunch,
  type AcpProtocolVersion,
} from "./api.ts";
import { openAcpPeerWith } from "./peer.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

const launch: AcpLaunch = { harness: "claude", command: "fake", args: [], version: "1" };

async function open(script: FakeAgentScript) {
  let agent: FakeAgent | undefined;
  const peer = await openAcpPeerWith(
    launch,
    { cwd: "C:/agent", signal: AbortSignal.timeout(5000) },
    { spawn: () => (agent = startFakeAgent(script)), cache: new Map<string, AcpProtocolVersion>() },
  );
  const methods = () => agent!.record.calls.map((call) => call.method);
  return { peer, agent: agent!, methods };
}

const configOptions = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select" as const,
    currentValue: "small",
    options: [
      { group: "fast", name: "Fast", options: [{ value: "small", name: "Small" }] },
      {
        group: "smart",
        name: "Smart",
        options: [{ value: "large", name: "Large", description: "Slow" }],
      },
    ],
  },
  { id: "plan", name: "Plan mode", type: "boolean" as const, currentValue: false },
];

const flattened: AcpConfigOption[] = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "small",
    values: [
      { value: "small", name: "Small" },
      { value: "large", name: "Large", description: "Slow" },
    ],
  },
  { id: "plan", name: "Plan mode", type: "boolean", currentValue: false, values: [] },
];

test("the peer reports the agent's advertised capabilities and sign-in methods", async () => {
  const { peer } = await open({
    agentInfo: { name: "claude-agent-acp", version: "0.109.0" },
    agentCapabilities: {
      loadSession: true,
      mcpCapabilities: { http: true },
      sessionCapabilities: {
        systemPrompt: { mode: { override: {} } },
        close: {},
        additionalDirectories: {},
      },
      auth: { logout: {} },
    },
    meta: { steering: { supported: true } },
    authMethods: [
      { id: "login", name: "Log in", type: "terminal", args: ["--login"] },
      { id: "key", name: "API key" },
    ],
  });
  expect(peer.agentInfo).toEqual({ name: "claude-agent-acp", version: "0.109.0" });
  expect(peer.capabilities).toEqual({
    loadSession: true,
    resume: false,
    close: true,
    delete: false,
    sessionOptions: false,
    additionalDirectories: true,
    systemPrompt: { append: true, override: true },
    mcp: { http: true, stdio: true, acp: false },
    steering: "extension",
    logout: true,
    authStatus: false,
  });
  expect(peer.authMethods).toEqual([
    { id: "login", name: "Log in", type: "terminal", args: ["--login"] },
    { id: "key", name: "API key", type: "agent" },
  ]);
  await peer.close();
});

test("probeConfigOptions asks session/options when advertised", async () => {
  const { peer, methods } = await open({
    agentCapabilities: { sessionCapabilities: { options: {} } },
    configOptions,
  });
  expect(await peer.probeConfigOptions("C:/agent", AbortSignal.timeout(5000))).toEqual(flattened);
  expect(methods()).toEqual(["initialize", "session/options"]);
  await peer.close();
});

test("probeConfigOptions otherwise opens, closes and deletes a throwaway session", async () => {
  const { peer, methods } = await open({
    agentCapabilities: { sessionCapabilities: { close: {}, delete: {} } },
    configOptions,
  });
  expect(await peer.probeConfigOptions("C:/agent", AbortSignal.timeout(5000))).toEqual(flattened);
  expect(methods()).toEqual(["initialize", "session/new", "session/close", "session/delete"]);
  await peer.close();
});

test("probing an agent that needs sign-in fails with the auth-required code", async () => {
  const { peer } = await open({ requireAuth: true });
  await rejects(peer.probeConfigOptions("C:/agent", AbortSignal.timeout(5000)), {
    code: acpAuthRequired,
  });
  await peer.close();
});

test("authenticate runs agent methods only, and logout needs the capability", async () => {
  const { peer, agent } = await open({
    authMethods: [
      { id: "login", name: "Log in", type: "terminal" },
      { id: "key", name: "API key" },
    ],
  });
  const signal = AbortSignal.timeout(5000);
  await peer.authenticate("key", signal);
  expect(agent.record.calls.at(-1)).toEqual({
    method: "authenticate",
    params: { methodId: "key" },
  });
  await rejects(peer.authenticate("login", signal), {
    code: "unsupported-capability",
  });
  await rejects(peer.authenticate("other", signal), {
    code: "invalid-command",
  });
  await rejects(peer.logout(signal), { code: "unsupported-capability" });
  await peer.close();
});
