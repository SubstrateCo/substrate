import { interruptionNote } from "@substrate/contracts/agent-work/control";
import type { HarnessCommand } from "@substrate/contracts/harness-runtime";

import { agentId, CodeError, deferred, organizationId, runtimeFixture } from "./test-support.ts";
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let fixture: Awaited<ReturnType<typeof runtimeFixture>> | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function started(options: Parameters<typeof runtimeFixture>[0] = {}) {
  fixture = await runtimeFixture(options);
  await fixture.runtime.start();
  await fixture.settle();
  return fixture;
}

const opens = (f: Awaited<ReturnType<typeof started>>) =>
  f.commands.filter(
    (command): command is Extract<HarnessCommand, { type: "open" }> => command.type === "open",
  );

test("the owner's stop interrupts the live turn, which ends as cancelled without a resume note", async () => {
  const f = await started();
  await f.message();
  const turn = f.turns()[0]!;
  f.control.stop(turn.turnId);
  await f.hint();
  expect(f.commands.at(-1)).toMatchObject({ type: "interrupt", turnId: turn.turnId });
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "interrupted" } });
  const finished = f.finished(turn.turnId);
  expect(finished).toMatchObject({ status: "cancelled", interruption: "stop" });
  expect(finished?.resume).toBeUndefined();
});

test("Send now interrupts the live turn, which ends as interrupted with its resume note", async () => {
  const f = await started();
  await f.message();
  const turn = f.turns()[0]!;
  f.control.stop(turn.turnId, "owner");
  await f.hint();
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "interrupted" } });
  expect(f.finished(turn.turnId)).toMatchObject({
    status: "interrupted",
    interruption: "owner",
    resume: interruptionNote("owner"),
  });
});

test("a stop that the host never answers closes the native session after 20 s, as cancelled", async () => {
  const f = await started();
  const sent = await f.message();
  const turn = f.turns()[0]!;
  f.hooks.command = (command) => (command.type === "interrupt" ? new Promise(() => {}) : undefined);
  f.control.stop(turn.turnId);
  await f.hint();
  await f.advance(19_000);
  expect(f.finished(turn.turnId)).toBeUndefined();
  await f.advance(1_000);
  expect(f.nativeSessions()).not.toContain(sent.sessionId);
  expect(f.finished(turn.turnId)).toMatchObject({ status: "cancelled" });
});

test("a stop while the session opens sends no turn and cancels it", async () => {
  const f = await started();
  const gate = deferred<void>();
  f.hooks.command = (command, next) =>
    command.type === "open" ? gate.promise.then(next) : undefined;
  const sent = await f.message();
  f.control.stop(sent.turnId);
  await f.hint();
  gate.resolve();
  await f.settle();
  expect(f.turns()).toEqual([]);
  expect(f.finished(sent.turnId)).toMatchObject({ status: "cancelled", interruption: "stop" });
});

test("a turn the owner stopped before it started ends without running", async () => {
  const f = await started();
  const sent = f.ownerItem();
  const queued = f.control.queueTurn({ session: sent.session, items: [sent.item] });
  const start = f.control.api.start.bind(f.control.api);
  f.control.api.start = async (...args) => {
    f.control.stop(queued.turn.id);
    return start(...args);
  };
  await f.hint();
  expect(f.turns()).toEqual([]);
  expect(f.finished(queued.turn.id)).toMatchObject({ status: "cancelled" });
});

test("when the worker exits after finished tools, the turn continues once as its next attempt", async () => {
  const f = await started();
  const sent = await f.message();
  const turn = f.turns()[0]!;
  await f.emit(turn.turnId, {
    type: "item.started",
    itemId: "i1",
    itemType: "mcp",
    title: "search",
  });
  await f.emit(turn.turnId, { type: "item.completed", itemId: "i1", status: "completed" });
  const native = opens(f)[0]!;
  await f.emit(turn.turnId, { type: "session.closed", reason: "worker_exited" });
  expect(f.hostCalls("recover").map((call) => call.body)).toEqual([
    { attempt: 1, unfinishedTool: false },
  ]);
  const continued = f.turns().at(-1)!;
  expect(continued).toMatchObject({ turnId: sent.turnId, generation: 2 });
  expect(continued.context).toEqual({ turnId: sent.turnId, attempt: 2 });
  expect(continued.input.text).toContain(`<resume turn="${sent.turnId}" previous_attempt="1">`);
  expect(continued.input.text).toContain("Finished: search");
  expect(opens(f).at(-1)).toMatchObject({ requireResume: true, epoch: native.epoch });
  expect((await f.runtime.turnRuns(sent.turnId)).map((run) => run.attempt)).toEqual([1, 2]);
});

test("a worker exit during a tool call reports the unfinished tool, and the turn needs the owner", async () => {
  const f = await started();
  const sent = await f.message();
  const turn = f.turns()[0]!;
  await f.emit(turn.turnId, {
    type: "item.started",
    itemId: "i1",
    itemType: "mcp",
    title: "write",
  });
  await f.emit(turn.turnId, { type: "session.closed", reason: "worker_exited" });
  expect(f.hostCalls("recover").at(-1)!.body).toEqual({ attempt: 1, unfinishedTool: true });
  expect(f.status(sent.turnId)).toBe("needs_attention");
  expect(f.turns()).toHaveLength(1);
});

test("after an app restart, a turn that died with the app recovers with the local evidence", async () => {
  const f = await started();
  const sent = await f.message();
  const turn = f.turns()[0]!;
  await f.emit(turn.turnId, { type: "turn.started" });
  await f.restart();
  expect(f.hostCalls("recover").map((call) => [call.turnId, call.body])).toEqual([
    [sent.turnId, { attempt: 1, unfinishedTool: false }],
  ]);
  const continued = f.turns().at(-1)!;
  expect(continued).toMatchObject({ turnId: sent.turnId, context: { attempt: 2 } });
  expect(opens(f).at(-1)).toMatchObject({ requireResume: true, nativeSessionId: "native-1" });
});

test("after an app restart, blocking requests of the dead turn are closed as orphaned", async () => {
  const f = await started();
  await f.message();
  const turn = f.turns()[0]!;
  await f.emit(turn.turnId, {
    type: "request.opened",
    requestId: "n1",
    kind: "permission",
    data: {
      sessionId: "native",
      toolCall: { toolCallId: "call-1", title: "ls", rawInput: {} },
      options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
    },
  });
  await f.restart();
  expect(f.closedRequests).toEqual(["orphaned"]);
});

test("an outage while loading messages retries later with backoff, without asking the owner", async () => {
  const f = await started();
  f.outage.sources = true;
  const sent = await f.message();
  expect(f.hostCalls("retryLater").map((call) => call.body)).toEqual([
    { attempt: 1, delayMs: 5_000 },
  ]);
  expect(f.status(sent.turnId)).toBe("cancelled");
  expect(f.control.turns.get(sent.turnId)!.items[0]!.status).toBe("pending");
  expect(f.turns()).toEqual([]);
});

test("a harness that is not connected after the start keeps the turn and retries its start", async () => {
  const f = await started();
  let fail = true;
  f.hooks.command = (command) =>
    command.type === "open" && fail ? Promise.reject(new CodeError("not-connected")) : undefined;
  const sent = await f.message();
  expect(f.hostCalls("retryLater").map((call) => call.body)).toEqual([
    { attempt: 1, delayMs: 5_000 },
  ]);
  expect(f.status(sent.turnId)).toBe("running");
  fail = false;
  await f.advance(5_000);
  expect(f.turns().map((turn) => turn.turnId)).toEqual([sent.turnId]);
});

test("a failure without a known code stops retrying after 6 backoffs and needs the owner", async () => {
  const f = await started();
  f.hooks.command = (command) =>
    command.type === "open" ? Promise.reject(new Error("unexpected")) : undefined;
  const sent = await f.message();
  for (let index = 0; index < 6; index++) await f.advance(5 * 60_000);
  expect(f.hostCalls("retryLater")).toHaveLength(6);
  expect(f.finished(sent.turnId)).toMatchObject({
    status: "needs_attention",
    attentionReason: "failed",
  });
});

test("a native session that cannot resume needs the owner", async () => {
  const f = await started();
  f.hooks.command = (command) =>
    command.type === "open" ? Promise.reject(new CodeError("resume-failed")) : undefined;
  const sent = await f.message();
  expect(f.finished(sent.turnId)).toMatchObject({
    status: "needs_attention",
    attentionReason: "resume_failed",
  });
});

test("a started turn whose turn command fails transiently follows recovery", async () => {
  const f = await started();
  let failures = 1;
  f.hooks.command = (command, next) =>
    command.type === "turn" && failures-- > 0
      ? next().then(() => Promise.reject(new CodeError("not-connected")))
      : undefined;
  const sent = await f.message();
  expect(f.hostCalls("recover").map((call) => call.turnId)).toEqual([sent.turnId]);
  expect(f.turns().at(-1)).toMatchObject({ turnId: sent.turnId, context: { attempt: 2 } });
});

test("a reset by the owner opens a fresh native session in a new epoch", async () => {
  const f = await started();
  const sent = await f.message();
  const first = f.turns()[0]!;
  await f.emit(first.turnId, { type: "turn.completed", result: { status: "completed" } });
  const fresh = opens(f)[0];
  expect(fresh).toMatchObject({ epoch: 0, requireResume: false });
  expect(fresh.nativeSessionId).toBeUndefined();

  await f.message({ conversationId: sent.conversationId });
  const second = f.turns().at(-1)!;
  expect(opens(f).at(-1)).toMatchObject({ epoch: 0, nativeSessionId: "native-1" });
  await f.emit(second.turnId, { type: "turn.completed", result: { status: "completed" } });

  f.control.reset(sent.sessionId);
  await f.message({ conversationId: sent.conversationId });
  const reset = opens(f).at(-1);
  expect(reset).toMatchObject({ epoch: 1, requireResume: false });
  expect(reset?.nativeSessionId).toBeUndefined();
  expect(await f.store.nativeSessions.get(organizationId, sent.sessionId)).toMatchObject({
    epoch: 1,
    resetGeneration: 1,
    nativeSessionId: "native-2",
  });
});

test("a full context submits an epoch handoff; its turn saves notes and the next epoch starts with them", async () => {
  const f = await started();
  const sent = await f.message();
  const first = f.turns()[0]!;
  await f.emit(first.turnId, {
    type: "usage.updated",
    usage: { contextUsed: 80, contextWindow: 100 },
  });
  await f.emit(first.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(f.hostCalls("submitEpoch").map((call) => call.body)).toEqual([
    { sessionId: sent.sessionId, fromEpoch: 0, body: expect.stringContaining("save_handoff") },
  ]);

  const handoff = f.turns().at(-1)!;
  expect(handoff).toMatchObject({ sessionId: sent.sessionId, mode: "unattended" });
  expect(f.control.turns.get(handoff.turnId)!.turn.handoff).toBe(true);
  const saved = await f.runtime.handleLocalTool({
    tool: "save_handoff",
    organizationId,
    agentId,
    sessionId: sent.sessionId,
    turn: handoff.context,
    input: { objectives: "Finish the report.", openWork: "Charts", references: ["doc-1"] },
  });
  expect(saved.success).toBe(true);
  await f.emit(handoff.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(f.nativeSessions()).not.toContain(sent.sessionId);

  await f.message({ conversationId: sent.conversationId });
  const next = f.turns().at(-1)!;
  expect(opens(f).at(-1)).toMatchObject({ epoch: 1 });
  expect(next.input.text).toContain("Objectives: Finish the report.");
  expect(next.input.text).toContain("References: doc-1");
});

test("a new working folder rotates the epoch: the handoff keeps the old folder, the next epoch opens in the new one", async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const before = await mkdtemp(join(tmpdir(), "opencode", "agent-project-"));
  const after = await mkdtemp(join(tmpdir(), "opencode", "agent-project-"));
  try {
    const f = await started();
    await f.store.workspaces.set(organizationId, agentId, before, 0);
    const sent = await f.message();
    const first = f.turns()[0]!;
    expect(opens(f).at(-1)).toMatchObject({ epoch: 0, workspace: before });
    await f.emit(first.turnId, { type: "turn.completed", result: { status: "completed" } });

    await f.store.workspaces.set(organizationId, agentId, after, 1);
    f.runtime.agentsChanged();
    await f.settle();
    expect(await f.store.nativeSessions.get(organizationId, sent.sessionId)).toMatchObject({
      rotation: "workspace",
      workspace: before,
    });
    await f.hint();
    const handoff = f.turns().at(-1)!;
    expect(f.control.turns.get(handoff.turnId)!.turn.handoff).toBe(true);
    expect(opens(f).at(-1)).toMatchObject({ epoch: 0, workspace: before });
    await f.emit(handoff.turnId, { type: "turn.completed", result: { status: "completed" } });

    await f.message({ conversationId: sent.conversationId });
    expect(opens(f).at(-1)).toMatchObject({ epoch: 1, workspace: after });
  } finally {
    await rm(before, { recursive: true, force: true });
    await rm(after, { recursive: true, force: true });
  }
});

test("app changes rotate the epoch without changing its frozen managed prefix", async () => {
  const f = await started();
  const sent = await f.message();
  const before = await f.store.nativeSessions.get(organizationId, sent.sessionId);
  expect(before?.prefix).toContain("Enabled workspace apps:");
  f.apps.enabledApps = ["messages", "agents", "tasks"];
  await f.runtime.sync();
  await f.settle();
  const after = await f.store.nativeSessions.get(organizationId, sent.sessionId);
  expect(after).toMatchObject({ prefix: before?.prefix, rotation: "policy" });
  expect(f.hostCalls("submitEpoch")).toHaveLength(1);
});

test("an enabled app the agent stops using rotates its epoch", async () => {
  const f = await started();
  f.apps.enabledApps = ["messages", "agents", "tasks"];
  const sent = await f.message();
  const before = await f.store.nativeSessions.get(organizationId, sent.sessionId);
  expect(before?.prefix).toContain("Enabled workspace apps: messages, agents, tasks");
  f.catalog[0]!.disabledApps = ["tasks"];
  f.runtime.agentsChanged();
  await f.settle();
  const after = await f.store.nativeSessions.get(organizationId, sent.sessionId);
  expect(after).toMatchObject({ prefix: before?.prefix, rotation: "policy" });
  expect(f.hostCalls("submitEpoch")).toHaveLength(1);
});

test("an agent that goes without an app the organization has off keeps its epoch", async () => {
  const f = await started();
  const sent = await f.message();
  f.catalog[0]!.disabledApps = ["crm"];
  f.runtime.agentsChanged();
  await f.settle();
  const after = await f.store.nativeSessions.get(organizationId, sent.sessionId);
  expect(after?.rotation).toBeNull();
  expect(f.hostCalls("submitEpoch")).toEqual([]);
});

test("a turn the server no longer gives this desktop stops here without a report", async () => {
  const f = await started();
  const sent = await f.message();
  f.control.release(sent.turnId);
  await f.hint();
  expect(f.commands.some((command) => command.type === "interrupt")).toBe(true);
  expect(f.nativeSessions()).not.toContain(sent.sessionId);
  expect(f.hostCalls("finish")).toEqual([]);
  expect(f.hostCalls("recover")).toEqual([]);
  expect(f.runtime.liveTurnIds()).toEqual([]);
});

test("an organization switch ends live work as interrupted with its resume note", async () => {
  const f = await started();
  const sent = await f.message();
  await f.runtime.shutdown();
  expect(f.closedOrganizations).toEqual([organizationId]);
  expect(f.finished(sent.turnId)).toMatchObject({
    status: "interrupted",
    interruption: "retire",
    resume: interruptionNote("retire"),
  });
});

test("a turn end that the server cannot take during an outage is sent again", async () => {
  const f = await started();
  const sent = await f.message();
  f.control.outage.host = true;
  await f.emit(sent.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(f.status(sent.turnId)).toBe("running");
  f.control.outage.host = false;
  await f.tick();
  expect(f.finished(sent.turnId)).toMatchObject({ status: "completed" });
  await f.tick();
  expect(f.hostCalls("finish")).toHaveLength(1);
});

test("native compaction holds the agent's folder from claims until it finishes", async () => {
  const f = await started({ capabilities: { compact: true } });
  const sent = await f.message();
  const gate = deferred<void>();
  f.hooks.command = (command, next) =>
    command.type === "compact" ? gate.promise.then(next) : undefined;
  await f.emit(sent.turnId, {
    type: "usage.updated",
    usage: { contextUsed: 90, contextWindow: 100 },
  });
  const ended = f.emit(sent.turnId, { type: "turn.completed", result: { status: "completed" } });
  await f.settle();
  await f.hint();
  expect(f.hostCalls("claim").at(-1)!.body).toEqual({ busyFolders: [`main:${agentId}`] });
  gate.resolve();
  await ended;
  await f.hint();
  expect(f.hostCalls("claim").at(-1)!.body).toEqual({ busyFolders: [] });
});
