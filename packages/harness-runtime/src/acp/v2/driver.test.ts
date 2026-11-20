import type { HarnessEventBody } from "@substrate/contracts/harness";

import type { EventScope, NativeAdapter } from "../../adapters/types.ts";
import { startFakeAgent, type FakeAgent, type FakeAgentScript } from "../../testing/fake-agent.ts";
import { createAcpAdapter } from "../adapter.ts";
import { acpAuthRequired, type AcpLaunch, type AcpProtocolVersion } from "../api.ts";
import { connectAcp, type AcpConnectDeps } from "../connection.ts";
import type { AcpDriverHandlers, AcpSteerOutcome, AcpUpdate } from "../driver.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

const launch: AcpLaunch = { harness: "codex", command: "fake", args: [], version: "1" };
const dual = [1, 2];

function spawner(script: FakeAgentScript) {
  const spawned: FakeAgent[] = [];
  const spawn: AcpConnectDeps["spawn"] = () => {
    const agent = startFakeAgent(script);
    spawned.push(agent);
    return agent;
  };
  return { spawn, spawned };
}

interface Driven {
  updates: AcpUpdate[];
  /** Resolves when an update matching the predicate arrives. */
  seen(match: (update: AcpUpdate) => boolean): Promise<void>;
}

/** Records updates; requests get answer(request), or the no-ask answer. */
function driven(
  answer: AcpDriverHandlers["request"] = async (request) => request.deny(),
): Driven & { handlers: AcpDriverHandlers } {
  const updates: AcpUpdate[] = [];
  const waiters: { match(update: AcpUpdate): boolean; resolve(): void }[] = [];
  return {
    updates,
    seen: (match) =>
      updates.some(match)
        ? Promise.resolve()
        : new Promise((resolve) => waiters.push({ match, resolve })),
    handlers: {
      update: (_sessionId, update) => {
        updates.push(update);
        for (const waiter of waiters.splice(0))
          if (waiter.match(update)) waiter.resolve();
          else waiters.push(waiter);
      },
      request: answer,
    },
  };
}

async function connect(script: FakeAgentScript, handlers: AcpDriverHandlers) {
  const agents = spawner(script);
  const live = await connectAcp(launch, "C:/agent", handlers, AbortSignal.timeout(5000), {
    spawn: agents.spawn,
    cache: new Map<string, AcpProtocolVersion>(),
  });
  const agent = () => agents.spawned.at(-1)!;
  const calls = (method: string) =>
    agent()
      .record.calls.filter((call) => call.method === method)
      .map((call) => call.params);
  return { live, connection: live.connection, agents, agent, calls };
}

const textOf = (updates: AcpUpdate[]) =>
  updates.map((update) => (update.type === "text" ? update.text : "")).join("");
const open = { cwd: "C:/agent", mcpServers: [] };

test("an agent that speaks v1 and v2 negotiates v2 on the first start", async () => {
  const f = await connect({ protocolVersions: dual }, driven().handlers);
  expect(f.connection.protocolVersion).toBe(2);
  expect(f.agents.spawned).toHaveLength(1);
  expect(f.calls("initialize")[0]).toMatchObject({
    protocolVersion: 2,
    info: { name: "substrate" },
  });
  expect(f.connection.capabilities).toMatchObject({
    resume: true,
    close: true,
    steering: "native",
    mcp: { http: true, stdio: true, acp: false },
  });
  await f.live.close();
});

test("a v1-only agent answering a v2 initialize is restarted on v1", async () => {
  const f = await connect({ protocolVersions: [1] }, driven().handlers);
  expect(f.connection.protocolVersion).toBe(1);
  expect(f.agents.spawned).toHaveLength(2);
  expect(f.calls("initialize")[0]).toMatchObject({ protocolVersion: 1 });
  await f.live.close();
});

test("a v2-only agent negotiates v2 without a restart", async () => {
  const f = await connect({ protocolVersions: [2] }, driven().handlers);
  expect(f.connection.protocolVersion).toBe(2);
  expect(f.agents.spawned).toHaveLength(1);
  await f.live.close();
});

test("the turn ends with the idle state_update, carrying its stop reason and usage", async () => {
  const d = driven();
  const f = await connect(
    {
      protocolVersions: dual,
      commands: ["compact"],
      defaultTurn: [
        { text: "hel", messageId: "m1" },
        { text: "lo", messageId: "m1" },
      ],
      promptUsage: { totalTokens: 30, inputTokens: 10, outputTokens: 20, cachedReadTokens: 5 },
    },
    d.handlers,
  );
  const opened = await f.connection.newSession(open, AbortSignal.timeout(5000));
  // The setup response carries the command list.
  expect(d.updates).toContainEqual({ type: "commands", names: ["compact"] });
  const result = await f.connection.prompt(opened.sessionId, "go");
  expect(result).toEqual({
    stopReason: "end_turn",
    usage: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 5 },
  });
  expect(textOf(d.updates)).toBe("hello");
  await f.live.close();
});

test("tool calls and messages are upserts: first sight creates, null and omission change nothing", async () => {
  const d = driven();
  const f = await connect(
    {
      protocolVersions: dual,
      defaultTurn: [
        { toolUpdate: { toolCallId: "t1", title: "Read", kind: "read", status: "pending" } },
        { toolUpdate: { toolCallId: "t1", title: null, status: "in_progress" } },
        { toolUpdate: { toolCallId: "t1", status: "completed" } },
        { toolUpdate: { toolCallId: "t2", title: "Stop", status: "cancelled" } },
        { text: "Hel", messageId: "m1" },
        { message: { id: "m1", text: "Hello" } },
        // A rewrite the client cannot apply to text it already emitted is dropped.
        { message: { id: "m1", text: "Bye" } },
      ],
    },
    d.handlers,
  );
  const opened = await f.connection.newSession(open, AbortSignal.timeout(5000));
  await f.connection.prompt(opened.sessionId, "go");
  expect(d.updates.filter((update) => update.type === "tool")).toEqual([
    {
      type: "tool",
      toolCallId: "t1",
      created: true,
      title: "Read",
      kind: "read",
      status: "pending",
    },
    { type: "tool", toolCallId: "t1", created: false, status: "in_progress" },
    { type: "tool", toolCallId: "t1", created: false, status: "completed" },
    { type: "tool", toolCallId: "t2", created: true, title: "Stop", status: "failed" },
  ]);
  expect(textOf(d.updates)).toBe("Hello");
  await f.live.close();
});

test("permission and form elicitation requests reach the host and return its answers", async () => {
  const d = driven(async (request) =>
    request.parse(
      request.kind === "permission" ? "allow" : { action: "accept", content: { name: "Ada" } },
    ),
  );
  const schema = { type: "object" as const, properties: { name: { type: "string" as const } } };
  const f = await connect(
    {
      protocolVersions: dual,
      defaultTurn: [
        { permission: { toolCallId: "t1" } },
        { elicitation: { message: "Name?", requestedSchema: schema } },
      ],
    },
    d.handlers,
  );
  const opened = await f.connection.newSession(open, AbortSignal.timeout(5000));
  expect(await f.connection.prompt(opened.sessionId, "go")).toMatchObject({
    stopReason: "end_turn",
  });
  expect(f.agent().record.permissions).toEqual([
    { outcome: { outcome: "selected", optionId: "allow" } },
  ]);
  expect(f.agent().record.elicitations).toEqual([{ action: "accept", content: { name: "Ada" } }]);
  await f.live.close();
});

test("a prompt during the turn steers it natively; without a turn nothing is sent", async () => {
  const d = driven();
  const f = await connect(
    { protocolVersions: dual, defaultTurn: [{ text: "a" }, { waitForSteer: true }, { text: "b" }] },
    d.handlers,
  );
  const opened = await f.connection.newSession(open, AbortSignal.timeout(5000));
  expect(await f.connection.steer(opened.sessionId, "early")).toBe("promptRequired");
  const done = f.connection.prompt(opened.sessionId, "go");
  await d.seen((update) => update.type === "text" && update.text === "a");
  expect(await f.connection.steer(opened.sessionId, "more")).toBe("injected");
  expect(await done).toMatchObject({ stopReason: "end_turn" });
  expect(f.agent().record.steers).toEqual(["more"]);
  expect(f.calls("session/prompt")).toHaveLength(2);
  expect(textOf(d.updates)).toBe("ab");
  await f.live.close();
});

/** A turn that waits in a permission request until the agent holds the test's steer. */
function heldSteer(
  steer: () => Promise<AcpSteerOutcome>,
  agent: () => FakeAgent,
): AcpDriverHandlers["request"] {
  return async (request) => {
    void steer();
    // The turn's prompt and the steer's prompt.
    await agent().until(
      (record) => record.calls.filter((call) => call.method === "session/prompt").length === 2,
    );
    return request.parse("allow");
  };
}

test("a steer still held when the turn goes idle is withdrawn and reports promptRequired", async () => {
  let steered: Promise<AcpSteerOutcome> = Promise.resolve("promptRequired");
  let sessionId = "";
  const f = await connect(
    {
      protocolVersions: dual,
      v2: { holdPrompts: true, honorCancelRequest: true },
      defaultTurn: [{ permission: { toolCallId: "t1" } }],
    },
    driven(
      heldSteer(
        () => (steered = f.connection.steer(sessionId, "more")),
        () => f.agent(),
      ),
    ).handlers,
  );
  sessionId = (await f.connection.newSession(open, AbortSignal.timeout(5000))).sessionId;
  expect(await f.connection.prompt(sessionId, "go")).toMatchObject({ stopReason: "end_turn" });
  expect(await steered).toBe("promptRequired");
  expect(f.agent().record.steers).toEqual([]);
  await f.live.close();
});

test("a held steer the agent inserts after the idle extends the turn to the next idle", async () => {
  const d = driven(
    heldSteer(
      () => (steered = f.connection.steer(sessionId, "more")),
      () => f.agent(),
    ),
  );
  let steered: Promise<AcpSteerOutcome> = Promise.resolve("promptRequired");
  let sessionId = "";
  const f = await connect(
    {
      protocolVersions: dual,
      v2: { holdPrompts: true },
      defaultTurn: [{ permission: { toolCallId: "t1" } }, { text: "first" }],
      turns: { more: [{ text: "second", messageId: "m2" }] },
    },
    d.handlers,
  );
  sessionId = (await f.connection.newSession(open, AbortSignal.timeout(5000))).sessionId;
  expect(await f.connection.prompt(sessionId, "go")).toMatchObject({ stopReason: "end_turn" });
  expect(await steered).toBe("injected");
  // The second interval's output arrived before the turn ended.
  expect(textOf(d.updates)).toBe("firstsecond");
  await f.live.close();
});

test("cancel ends the turn with the cancelled idle and cancels pending requests", async () => {
  const opened = Promise.withResolvers<void>();
  const d = driven(async (request, signal) => {
    opened.resolve();
    await new Promise((resolve) => signal.addEventListener("abort", resolve));
    return request.cancelled();
  });
  const f = await connect(
    { protocolVersions: dual, defaultTurn: [{ permission: { toolCallId: "t1" } }] },
    d.handlers,
  );
  const session = await f.connection.newSession(open, AbortSignal.timeout(5000));
  const done = f.connection.prompt(session.sessionId, "go");
  await opened.promise;
  await f.connection.cancel(session.sessionId);
  expect(await done).toMatchObject({ stopReason: "cancelled" });
  expect(f.agent().record.permissions).toEqual([{ outcome: { outcome: "cancelled" } }]);
  await f.live.close();
});

test("auth uses auth/login and auth/logout, and maps v2 method descriptors", async () => {
  const f = await connect(
    {
      protocolVersions: dual,
      requireAuth: true,
      v2: {
        authMethods: [
          { methodId: "agent-login", type: "agent", name: "Log in" },
          {
            methodId: "terminal-login",
            type: "terminal",
            name: "Terminal",
            args: ["--login"],
            env: [{ name: "INTERACTIVE", value: "1" }],
          },
        ],
      },
    },
    driven().handlers,
  );
  expect(f.connection.authMethods).toEqual([
    { id: "agent-login", name: "Log in", type: "agent" },
    {
      id: "terminal-login",
      name: "Terminal",
      type: "terminal",
      args: ["--login"],
      env: { INTERACTIVE: "1" },
    },
  ]);
  expect(f.connection.capabilities.logout).toBe(true);
  await rejects(f.connection.newSession(open, AbortSignal.timeout(5000)), {
    code: acpAuthRequired,
  });
  await f.connection.authenticate("agent-login", AbortSignal.timeout(5000));
  await f.connection.newSession(open, AbortSignal.timeout(5000));
  await f.connection.logout(AbortSignal.timeout(5000));
  expect(f.calls("auth/login")).toEqual([{ methodId: "agent-login" }]);
  expect(f.calls("auth/logout")).toHaveLength(1);
  await f.live.close();
});

test("a provided MCP server answers the agent's mcp/message requests on v2", async () => {
  const f = await connect(
    {
      protocolVersions: dual,
      v2: { capabilities: { session: { mcp: { acp: {} } } } },
      defaultTurn: [{ mcp: { server: "substrate", method: "tools/list" } }],
    },
    driven().handlers,
  );
  expect(f.connection.capabilities.mcp).toEqual({ http: false, stdio: false, acp: true });
  const served = f.connection.provideMcpServer!("substrate", (request) => ({
    result: { method: request.method },
  }));
  const opened = await f.connection.newSession(
    { cwd: "C:/agent", mcpServers: [served.declaration] },
    AbortSignal.timeout(5000),
  );
  expect(f.calls("session/new")[0]).toMatchObject({
    mcpServers: [{ type: "acp", name: "substrate", serverId: served.declaration.serverId }],
  });
  await f.connection.prompt(opened.sessionId, "go");
  expect(f.agent().record.mcp).toEqual([{ result: { method: "tools/list" } }]);
  await served.dispose();
  await f.live.close();
});

test("loading a session resumes it with a replay from the start", async () => {
  const f = await connect({ protocolVersions: dual }, driven().handlers);
  await f.connection.loadSession("native-1", open, AbortSignal.timeout(5000));
  await f.connection.resumeSession("native-1", open, AbortSignal.timeout(5000));
  expect(f.calls("session/resume")).toMatchObject([
    { sessionId: "native-1", replayFrom: { type: "start" } },
    { sessionId: "native-1" },
  ]);
  expect(f.calls("session/resume")[1]).not.toHaveProperty("replayFrom");
  await f.live.close();
});

test("the adapter runs a v2 turn, a native steer and an interrupt end to end", async () => {
  const events: { body: HarnessEventBody; scope: EventScope }[] = [];
  let agent: FakeAgent | undefined;
  const adapter: NativeAdapter = await createAcpAdapter(
    {
      launch,
      prefixChannel: "instructions",
      prefix: "",
      context: {
        directory: "C:/agent",
        emit: (body, scope = "turn") => events.push({ body, scope }),
      },
    },
    {
      spawn: () =>
        (agent = startFakeAgent({
          protocolVersions: dual,
          defaultTurn: [{ text: "a" }, { waitForSteer: true }, { text: "b" }],
          turns: { stop: [{ waitForCancel: true }] },
        })),
      cache: new Map<string, AcpProtocolVersion>(),
      commandsWaitMs: 0,
    },
  );
  expect(adapter.capabilities).toMatchObject({ steer: true, steerEvidence: true });
  const done = adapter.turn({ inputIds: ["a"], text: "go" }, { mode: "interactive" });
  await agent!.until((record) => record.waits.includes("waitForSteer"));
  await adapter.steer!({ inputId: "b", text: "more" });
  expect(await done).toEqual({ status: "completed", consumedInputIds: ["a", "b"] });
  expect(events.map((event) => event.body)).toContainEqual({
    type: "input.consumed",
    inputId: "b",
  });

  const stopped = adapter.turn({ inputIds: ["c"], text: "stop" }, { mode: "interactive" });
  await agent!.until((record) => record.waits.includes("waitForCancel"));
  await adapter.interrupt();
  expect(await stopped).toMatchObject({ status: "interrupted" });
  await adapter.disconnect();
});
