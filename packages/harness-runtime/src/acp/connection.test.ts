import { startFakeAgent, type FakeAgent, type FakeAgentScript } from "../testing/fake-agent.ts";
import type { AcpLaunch, AcpProtocolVersion } from "./api.ts";
import { connectAcp, type AcpConnectDeps } from "./connection.ts";
import type { AcpDriverHandlers, AcpTransport, ProtocolDriver } from "./driver.ts";
import { v1Driver } from "./v1/driver.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { join } from "node:path";

const launch: AcpLaunch = { harness: "codex", command: "fake", args: [], version: "1" };
const handlers: AcpDriverHandlers = {
  update: () => {},
  request: async (request) => request.deny(),
};

/**
 * Stands in for a v2 driver: it asks for v2 on the wire and never accepts, so every agent in
 * these tests negotiates down to v1.
 */
const v2Probe: ProtocolDriver = {
  version: 2,
  async initialize(transport: AcpTransport) {
    const writer = transport.output.getWriter();
    const request = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 2 } };
    await writer.write(new TextEncoder().encode(`${JSON.stringify(request)}\n`));
    writer.releaseLock();
    const reader = transport.input.getReader();
    let line = "";
    while (!line.includes("\n")) {
      const chunk = await reader.read();
      if (chunk.done) break;
      line += new TextDecoder().decode(chunk.value);
    }
    reader.releaseLock();
    const response = JSON.parse(line.split("\n")[0]!);
    if (response.error) return { type: "retry", versions: response.error.data.supported };
    return { type: "retry", versions: [response.result.protocolVersion] };
  },
};

function spawner(script: FakeAgentScript) {
  const spawned: FakeAgent[] = [];
  const stopped: FakeAgent[] = [];
  const spawn: AcpConnectDeps["spawn"] = () => {
    const agent = startFakeAgent(script);
    spawned.push(agent);
    return {
      ...agent,
      stop: async () => {
        stopped.push(agent);
        await agent.stop();
      },
    };
  };
  return { spawn, spawned, stopped };
}

test("a -32022 answer restarts the agent and initializes with a supported version", async () => {
  const agents = spawner({ protocolVersions: [1], rejectUnsupportedVersion: true });
  const cache = new Map<string, AcpProtocolVersion>();
  const live = await connectAcp(launch, "C:/agent", handlers, AbortSignal.timeout(5000), {
    spawn: agents.spawn,
    drivers: [v1Driver, v2Probe],
    cache,
  });
  expect(live.connection.protocolVersion).toBe(1);
  expect(agents.spawned).toHaveLength(2);
  expect(agents.stopped).toEqual([agents.spawned[0]!]);
  expect(agents.spawned[1]!.record.calls[0]).toMatchObject({
    method: "initialize",
    params: { protocolVersion: 1 },
  });
  await live.close();

  // The negotiated version is remembered: the next start asks for v1 at once.
  const again = spawner({ protocolVersions: [1], rejectUnsupportedVersion: true });
  const next = await connectAcp(launch, "C:/agent", handlers, AbortSignal.timeout(5000), {
    spawn: again.spawn,
    drivers: [v1Driver, v2Probe],
    cache,
  });
  expect(again.spawned).toHaveLength(1);
  expect(cache.get("agent:fake-agent@1.0.0")).toBe(1);
  await next.close();
});

test("an agent that selects a lower version is restarted with that version", async () => {
  const agents = spawner({ protocolVersions: [1] });
  const live = await connectAcp(launch, "C:/agent", handlers, AbortSignal.timeout(5000), {
    spawn: agents.spawn,
    drivers: [v1Driver, v2Probe],
    cache: new Map<string, AcpProtocolVersion>(),
  });
  expect(live.connection.protocolVersion).toBe(1);
  expect(agents.spawned).toHaveLength(2);
  await live.close();
});

test("an agent with no common version fails as unsupported", async () => {
  const agents = spawner({ protocolVersions: [3], rejectUnsupportedVersion: true });
  await rejects(
    connectAcp(launch, "C:/agent", handlers, AbortSignal.timeout(5000), {
      spawn: agents.spawn,
      drivers: [v1Driver],
      cache: new Map<string, AcpProtocolVersion>(),
    }),
    { code: "unsupported-capability" },
  );
  expect(agents.stopped).toEqual(agents.spawned);
});

test("a spawned stdio agent initializes, and its exit closes the connection", async () => {
  const stdio: AcpLaunch = {
    harness: "opencode",
    command: process.execPath,
    args: [join(__dirname, "..", "testing", "fake-agent.ts")],
    env: { FAKE_ACP_SCRIPT: JSON.stringify({ defaultTurn: [{ text: "hi" }, { exit: 3 }] }) },
    version: "1",
  };
  const live = await connectAcp(stdio, __dirname, handlers, AbortSignal.timeout(20_000), {
    cache: new Map<string, AcpProtocolVersion>(),
  });
  const connection = live.connection;
  const opened = await connection.newSession(
    { cwd: __dirname, mcpServers: [] },
    AbortSignal.timeout(5000),
  );
  await rejects(connection.prompt(opened.sessionId, "go"), {
    code: "disconnected",
  });
  await connection.closed;
  await live.close();
}, 30_000);
