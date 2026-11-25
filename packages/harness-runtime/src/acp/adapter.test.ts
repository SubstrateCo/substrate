import type { HarnessEventBody } from "@substrate/contracts/harness";

import type { AdapterContext, EventScope, NativeAdapter } from "../adapters/types.ts";
import type { McpLease } from "../mcp.ts";
import { startFakeAgent, type FakeAgent, type FakeAgentScript } from "../testing/fake-agent.ts";
import { createAcpAdapter } from "./adapter.ts";
import {
  acpAuthRequired,
  type AcpConnectOptions,
  type AcpLaunch,
  type AcpProtocolVersion,
} from "./api.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

const launch: AcpLaunch = { harness: "claude", command: "fake", args: [], version: "1" };

const lease: McpLease = {
  url: "http://127.0.0.1:1234/mcp",
  token: "session-secret",
  organizationId: "org-a",
  agentId: "agent-a",
  sessionId: "session-a",
  bind: () => {},
  unbind: () => {},
  revoke: () => {},
};

interface Fixture {
  adapter: NativeAdapter;
  agent: FakeAgent;
  events: { body: HarnessEventBody; scope: EventScope }[];
  calls(method: string): unknown[];
  next(type: HarnessEventBody["type"]): Promise<HarnessEventBody>;
}

async function open(
  script: FakeAgentScript,
  options: Partial<Omit<AcpConnectOptions, "context">> = {},
  context: Partial<AdapterContext> = {},
): Promise<Fixture> {
  const events: Fixture["events"] = [];
  const waiters: { type: string; resolve(body: HarnessEventBody): void }[] = [];
  let agent: FakeAgent | undefined;
  const adapter = await createAcpAdapter(
    {
      launch,
      prefixChannel: "instructions",
      prefix: "",
      ...options,
      context: {
        directory: "C:/agent",
        emit: (body, scope = "turn") => {
          events.push({ body, scope });
          const index = waiters.findIndex((waiter) => waiter.type === body.type);
          if (index >= 0) waiters.splice(index, 1)[0]!.resolve(body);
        },
        ...context,
      },
    },
    {
      spawn: () => (agent = startFakeAgent(script)),
      cache: new Map<string, AcpProtocolVersion>(),
      commandsWaitMs: 200,
    },
  );
  return {
    adapter,
    agent: agent!,
    events,
    calls: (method) =>
      agent!.record.calls.filter((call) => call.method === method).map((call) => call.params),
    next: (type) => new Promise((resolve) => waiters.push({ type, resolve })),
  };
}

const httpMcp = { mcpCapabilities: { http: true } };

test("session setup passes the lease, user MCP servers and the system prompt on every setup", async () => {
  const f = await open(
    {
      agentCapabilities: { ...httpMcp, sessionCapabilities: { systemPrompt: {}, resume: {} } },
    },
    { prefixChannel: "systemPrompt", prefix: "managed prefix", resumeId: "native-1" },
    {
      lease,
      mcpServers: [
        {
          id: "files",
          name: "files",
          transport: "stdio",
          command: "C:/bin/files.exe",
          environment: { ROOT: "C:/data" },
        },
        { id: "web", name: "web", transport: "http", url: "https://mcp.example.com/" },
      ],
    },
  );
  expect(f.calls("session/resume")).toEqual([
    {
      sessionId: "native-1",
      cwd: "C:/agent",
      mcpServers: [
        {
          type: "http",
          name: "substrate",
          url: lease.url,
          headers: [{ name: "Authorization", value: "Bearer session-secret" }],
        },
        {
          name: "files",
          command: "C:/bin/files.exe",
          args: [],
          env: [{ name: "ROOT", value: "C:/data" }],
        },
        { type: "http", name: "web", url: "https://mcp.example.com/", headers: [] },
      ],
      systemPrompt: { mode: "append", content: [{ type: "text", text: "managed prefix" }] },
    },
  ]);
  expect(f.adapter.nativeSessionId).toBe("native-1");
  await f.adapter.disconnect();
});

test("the instructions channel sends no system prompt", async () => {
  const f = await open(
    { agentCapabilities: { sessionCapabilities: { systemPrompt: {} } } },
    { prefixChannel: "instructions", prefix: "managed prefix" },
  );
  expect(f.calls("session/new")).toEqual([{ cwd: "C:/agent", mcpServers: [] }]);
  await f.adapter.disconnect();
});

test("setup fails as unsupported when the agent lacks a required capability", async () => {
  await rejects(open({}, { prefixChannel: "systemPrompt", prefix: "p" }), {
    code: "unsupported-capability",
  });
  await rejects(open({}, {}, { lease }), { code: "unsupported-capability" });
  await rejects(open({}, { resumeId: "native-1" }), {
    code: "unsupported-capability",
  });
});

test("session/load is the resume fallback, and its replayed history is not emitted", async () => {
  const f = await open({ agentCapabilities: { loadSession: true } }, { resumeId: "native-1" });
  expect(f.calls("session/load")).toHaveLength(1);
  expect(f.events).toEqual([]);
  await f.adapter.disconnect();
});

test("auth_required during setup is a native-auth-required error", async () => {
  await rejects(open({ requireAuth: true }), { code: acpAuthRequired });
});

test("the model is set on the config option whose category is model", async () => {
  const configOptions = [
    {
      id: "model-choice",
      name: "Model",
      category: "model",
      type: "select" as const,
      currentValue: "small",
      options: [
        { group: "fast", name: "Fast", options: [{ value: "small", name: "Small" }] },
        { group: "smart", name: "Smart", options: [{ value: "large", name: "Large" }] },
      ],
    },
  ];
  const f = await open({ configOptions }, {}, { model: "large" });
  expect(f.calls("session/set_config_option")).toEqual([
    { sessionId: "fake-session-1", configId: "model-choice", value: "large" },
  ]);
  await f.adapter.disconnect();
  await rejects(open({ configOptions }, {}, { model: "missing" }), {
    code: "invalid-model",
  });
});

test("a turn emits whole text messages, labelled tool items and usage", async () => {
  const f = await open({
    promptUsage: { totalTokens: 30, inputTokens: 20, outputTokens: 10, cachedReadTokens: 5 },
    defaultTurn: [
      { text: "Hello ", messageId: "m1" },
      { text: "world", messageId: "m1" },
      { text: "Second", messageId: "m2" },
      {
        tool: {
          id: "t1",
          title: "Read file",
          name: "Read",
          rawInput: { file_path: "C:/a/README.md" },
        },
      },
      { toolDone: { id: "t1", status: "completed" } },
      { usage: { used: 500, size: 1000 } },
      { text: "Done" },
    ],
  });
  const result = await f.adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "interactive" });
  expect(f.events.map((event) => event.body)).toEqual([
    { type: "text", text: "Hello world" },
    { type: "text", text: "Second" },
    { type: "item.started", itemId: "t1", itemType: "tool", title: "Read · README.md" },
    { type: "item.completed", itemId: "t1", status: "completed" },
    { type: "usage.updated", usage: { contextUsed: 500, contextWindow: 1000 } },
    { type: "text", text: "Done" },
  ]);
  expect(f.events.every((event) => event.scope === "turn")).toBe(true);
  expect(result).toEqual({
    status: "completed",
    consumedInputIds: ["a"],
    usage: {
      inputTokens: 20,
      outputTokens: 10,
      cachedInputTokens: 5,
      contextUsed: 500,
      contextWindow: 1000,
    },
  });
  await f.adapter.disconnect();
});

test("interactive permission requests open a host request and return the chosen option", async () => {
  const f = await open({ defaultTurn: [{ permission: { toolCallId: "t1" } }] });
  const opened = f.next("request.opened");
  const done = f.adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "interactive" });
  const request = await opened;
  if (request.type !== "request.opened") throw new Error("unreachable");
  expect(request.kind).toBe("permission");
  expect(request.data).toMatchObject({ toolCall: { toolCallId: "t1" } });
  await rejects(f.adapter.respond(request.requestId, "not-an-option"), {
    code: "invalid-response",
  });
  await f.adapter.respond(request.requestId, "allow");
  expect(await done).toMatchObject({ status: "completed" });
  expect(f.agent.record.permissions).toEqual([
    { outcome: { outcome: "selected", optionId: "allow" } },
  ]);
  await f.adapter.disconnect();
});

test("a null permission response cancels the native request", async () => {
  const f = await open({ defaultTurn: [{ permission: { toolCallId: "t1" } }] });
  const opened = f.next("request.opened");
  const done = f.adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "interactive" });
  const request = await opened;
  if (request.type !== "request.opened") throw new Error("unreachable");
  await f.adapter.respond(request.requestId, null);
  await done;
  expect(f.agent.record.permissions).toEqual([{ outcome: { outcome: "cancelled" } }]);
  await f.adapter.disconnect();
});

const schema = { type: "object" as const, properties: { name: { type: "string" as const } } };

test("unattended turns deny permissions and decline elicitations without asking the host", async () => {
  const f = await open({
    defaultTurn: [
      { permission: { toolCallId: "t1" } },
      { elicitation: { message: "Name?", requestedSchema: schema } },
    ],
  });
  await f.adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "unattended" });
  expect(f.agent.record.permissions).toEqual([
    { outcome: { outcome: "selected", optionId: "reject" } },
  ]);
  expect(f.agent.record.elicitations).toEqual([{ action: "decline" }]);
  expect(f.events.some((event) => event.body.type === "request.opened")).toBe(false);
  await f.adapter.disconnect();
});

test("form elicitation opens an input request and validates the response shape", async () => {
  const f = await open({
    defaultTurn: [{ elicitation: { message: "Name?", requestedSchema: schema } }],
  });
  const opened = f.next("request.opened");
  const done = f.adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "interactive" });
  const request = await opened;
  if (request.type !== "request.opened") throw new Error("unreachable");
  expect(request.kind).toBe("input");
  expect(request.data).toMatchObject({ mode: "form", message: "Name?" });
  await rejects(f.adapter.respond(request.requestId, { action: "maybe" }), {
    code: "invalid-response",
  });
  await f.adapter.respond(request.requestId, { action: "accept", content: { name: "Ada" } });
  await done;
  expect(f.agent.record.elicitations).toEqual([{ action: "accept", content: { name: "Ada" } }]);
  await f.adapter.disconnect();
});

test("a request the agent withdraws closes on the host, and the turn goes on", async () => {
  const f = await open({
    defaultTurn: [
      { elicitation: { message: "Name?", requestedSchema: schema, withdrawAfterMs: 50 } },
      { text: "Continued without an answer" },
    ],
  });
  const opened = f.next("request.opened");
  const closed = f.next("request.closed");
  const done = f.adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "interactive" });
  const request = await opened;
  if (request.type !== "request.opened") throw new Error("unreachable");
  expect(await closed).toEqual({ type: "request.closed", requestId: request.requestId });
  expect(await done).toMatchObject({ status: "completed" });
  expect(f.events.map((event) => event.body)).toContainEqual({
    type: "text",
    text: "Continued without an answer",
  });
  // The withdrawn request no longer takes an answer.
  await rejects(f.adapter.respond(request.requestId, { action: "decline" }), {
    code: "unknown-request",
  });
  await f.adapter.disconnect();
});

test("interrupt cancels pending requests and the turn ends interrupted", async () => {
  const f = await open({
    defaultTurn: [{ permission: { toolCallId: "t1" } }, { waitForCancel: true }],
  });
  const opened = f.next("request.opened");
  const done = f.adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "interactive" });
  await opened;
  expect(await f.adapter.interrupt()).toEqual({});
  expect(await done).toMatchObject({ status: "interrupted" });
  expect(f.agent.record.permissions).toEqual([{ outcome: { outcome: "cancelled" } }]);
  expect(f.calls("session/cancel")).toHaveLength(1);
  await f.adapter.disconnect();
});

test("steering joins the live turn through the extension and marks the input consumed", async () => {
  const f = await open({
    meta: { steering: { supported: true } },
    defaultTurn: [{ waitForSteer: true }, { text: "steered" }],
  });
  expect(f.adapter.capabilities).toMatchObject({ steer: true, steerEvidence: true });
  await rejects(f.adapter.steer!({ inputId: "x", text: "early" }), {
    code: "turn-not-live",
  });
  const done = f.adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "interactive" });
  await f.agent.until((record) => record.waits.includes("waitForSteer"));
  await f.adapter.steer!({ inputId: "b", text: "also this" });
  expect(await done).toMatchObject({ status: "completed", consumedInputIds: ["a", "b"] });
  expect(f.agent.record.steers).toEqual(["also this"]);
  expect(f.events).toContainEqual({
    body: { type: "input.consumed", inputId: "b" },
    scope: "turn",
  });
  await f.adapter.disconnect();
});

test("without the steering extension the adapter cannot steer", async () => {
  const f = await open({});
  expect(f.adapter.capabilities.steer).toBe(false);
  expect("steer" in f.adapter).toBe(false);
  await f.adapter.disconnect();
});

test("compact is available only when the session lists it, and reports the compaction", async () => {
  const plain = await open({});
  expect(plain.adapter.capabilities.compact).toBe(false);
  await plain.adapter.disconnect();

  const f = await open({ commands: ["compact", "review"] });
  expect(f.adapter.capabilities.compact).toBe(true);
  await f.adapter.compact!();
  expect(f.calls("session/prompt")).toMatchObject([
    { prompt: [{ type: "text", text: "/compact" }] },
  ]);
  expect(f.events).toEqual([{ body: { type: "compaction" }, scope: "session" }]);
  await f.adapter.disconnect();
});

test("disconnect closes the session when advertised and stops the agent", async () => {
  const f = await open({ agentCapabilities: { sessionCapabilities: { close: {} } } });
  await f.adapter.disconnect();
  expect(f.calls("session/close")).toEqual([{ sessionId: "fake-session-1" }]);
  expect(await f.agent.exited).toBeInstanceOf(Error);
});

test("an agent exit fails the live turn and reports the lost connection", async () => {
  const f = await open({ defaultTurn: [{ text: "partial" }, { exit: 1 }] });
  const result = await f.adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "interactive" });
  expect(result.status).toBe("failed");
  const bodies = f.events.map((event) => event.body);
  expect(bodies).toContainEqual({ type: "text", text: "partial" });
  expect(bodies).toContainEqual(expect.objectContaining({ type: "error", code: "disconnected" }));
  await rejects(f.adapter.turn({ inputIds: ["b"], text: "again" }, { mode: "interactive" }), {
    code: "disconnected",
  });
  await f.adapter.disconnect();
});
