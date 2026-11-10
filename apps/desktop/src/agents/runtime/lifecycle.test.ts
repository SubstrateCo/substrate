import type { HarnessCommand } from "@startup-os/contracts/harness";

import {
  agentId,
  CodeError,
  deferred,
  installationId,
  openStore,
  organizationId,
  runtimeFixture,
  type RuntimeFixture,
} from "./test-support.ts";
import { outageBackoffMaxMs } from "./turn-executor.ts";
import { afterEach, expect, test } from "bun:test";

/* oxlint-disable deslop/no-unknown-parameters, deslop/require-safety-comment-for-type-assertion -- Recorded fake server bodies and harness commands are untyped, as the real boundaries are. */

type TurnCommand = Extract<HarnessCommand, { type: "turn" }>;
type OpenCommand = Extract<HarnessCommand, { type: "open" }>;

let fixture: RuntimeFixture | undefined;
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

const lastTurn = (f: RuntimeFixture) => f.turns().at(-1) as TurnCommand;
const commandsOf = (f: RuntimeFixture, type: HarnessCommand["type"]) =>
  f.commands.filter((command) => command.type === type);
const closedStatuses = (f: RuntimeFixture) =>
  f.posts
    .filter((post) => post.method === "closeRequest")
    .map((post) => post.body as { requestId: string; status: string });

test("when the harness worker exits, its live turn is interrupted and continues once when safe", async () => {
  const f = await started();
  await f.message();
  const turn = lastTurn(f);
  await f.emit(turn.turnId, { type: "turn.started" });
  const closed = { type: "session.closed" as const, reason: "worker_exited" as const };
  await f.emit(turn.turnId, closed);
  const continued = lastTurn(f);
  expect(continued).toMatchObject({ turnId: turn.turnId, generation: 2 });
  expect(await f.store.turns.get(turn.turnId)).toMatchObject({ attempt: 2, recoveries: 1 });

  // A second exit of the same turn needs the owner.
  await f.emit(turn.turnId, { type: "turn.started" });
  await f.emit(turn.turnId, closed);
  expect(await f.store.turns.get(turn.turnId)).toMatchObject({
    status: "needs_attention",
    attentionReason: "interrupted_again",
  });
});

test("an organization switch closes the native session of live work, and the work resumes on return", async () => {
  const f = await started();
  await f.message();
  const turn = lastTurn(f);
  await f.emit(turn.turnId, { type: "turn.started" });
  // The controller verifies the new organization before the old runtime retires.
  f.switchOrganization("org-2");
  await f.runtime.shutdown();
  expect(f.closedOrganizations).toEqual([organizationId]);
  expect(f.nativeSessions()).toEqual([]);
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("interrupted");
  expect(f.runtime.liveTurnIds()).toEqual([]);
  const [resume] = await f.store.inbox.openForSessions([turn.sessionId]);
  expect(resume).toMatchObject({ source: "recovery", status: "pending" });
  // Late events of the ended turn change nothing.
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("interrupted");

  f.switchOrganization(organizationId);
  await f.restart();
  const resumed = lastTurn(f);
  expect(resumed).toMatchObject({ sessionId: turn.sessionId });
  expect(resumed.turnId).not.toBe(turn.turnId);
  expect(resumed.input.text).toContain(`<resume turn="${turn.turnId}"`);
  expect(f.runtime.liveTurnIds()).toEqual([resumed.turnId]);
  expect(await f.store.turns.needsAttention(organizationId)).toEqual([]);
});

test("a steer the host refuses puts the message back, and the next turn takes it", async () => {
  const f = await started({ capabilities: { steer: true, steerEvidence: true } });
  const { conversationId } = await f.message();
  const turn = lastTurn(f);
  f.hooks.command = (command) =>
    command.type === "steer" ? Promise.reject(new CodeError("steer-unsupported")) : undefined;
  await f.message({ conversationId, body: "Also this" });
  const [item] = await f.store.inbox
    .openForSessions([turn.sessionId])
    .then((rows) => rows.filter((row) => row.turnId !== turn.turnId));
  expect(item).toMatchObject({ status: "pending", steered: false, turnId: null });

  f.hooks.command = undefined;
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(lastTurn(f).input.inputIds).toEqual([item!.id]);
});

for (const code of ["timeout", "worker-stopped", "session-changed", "disconnected", undefined])
  test(`a steer that fails with ${code ?? "no code"} may have been delivered: the owner decides`, async () => {
    const f = await started({ capabilities: { steer: true, steerEvidence: true } });
    const { conversationId } = await f.message();
    const turn = lastTurn(f);
    f.hooks.command = (command) => {
      if (command.type !== "steer") return undefined;
      return Promise.reject(code ? new CodeError(code) : new Error("Lost."));
    };
    await f.message({ conversationId, body: "Also this" });
    const steer = commandsOf(f, "steer")[0] as Extract<HarnessCommand, { type: "steer" }>;
    expect(await f.store.inbox.get(steer.inputId)).toMatchObject({
      status: "uncertain",
      turnId: turn.turnId,
      held: false,
    });

    f.hooks.command = undefined;
    await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
    // Never sent again by itself.
    expect(f.turns()).toHaveLength(1);
    expect((await f.runtime.agents())[0]?.state).toBe("needs_you");
    await f.runtime.resendItem(steer.inputId);
    await f.settle();
    expect(lastTurn(f).input.inputIds).toEqual([steer.inputId]);
  });

test("consumption evidence that arrives while the steer command runs still applies", async () => {
  const f = await started({ capabilities: { steer: true, steerEvidence: true } });
  const { conversationId } = await f.message();
  const turn = lastTurn(f);
  f.hooks.command = (command) => {
    if (command.type !== "steer") return undefined;
    f.runtime.onHarnessEvent({
      type: "input.consumed",
      inputId: command.inputId,
      sessionId: command.sessionId,
      organizationId,
      turnId: turn.turnId,
      generation: turn.generation,
      timestamp: f.now(),
    });
    return Promise.resolve();
  };
  await f.message({ conversationId, body: "Also this" });
  const steer = commandsOf(f, "steer")[0] as Extract<HarnessCommand, { type: "steer" }>;
  expect((await f.store.inbox.get(steer.inputId))!.status).toBe("consumed");
});

test("Stop while the session opens sends no turn and cancels it", async () => {
  const f = await started();
  const opening = deferred();
  f.hooks.command = (command) => (command.type === "open" ? opening.promise : undefined);
  await f.message();
  const [turn] = await f.store.turns.assigned(organizationId);
  await f.runtime.stop(turn!.id);
  f.hooks.command = undefined;
  opening.resolve({
    nativeSessionId: "native-1",
    capabilities: {
      steer: false,
      steerEvidence: false,
      compact: false,
      usage: false,
      noAskProfile: false,
      interruptReceipt: false,
    },
    resumed: false,
  });
  await f.settle();
  expect(f.turns()).toEqual([]);
  expect((await f.store.turns.get(turn!.id))!.status).toBe("cancelled");
});

test("a turn that ends with uncertain input needs the owner, who can send the message again", async () => {
  const f = await started({ capabilities: { steer: true, steerEvidence: true } });
  const { conversationId } = await f.message();
  const turn = lastTurn(f);
  await f.message({ conversationId, body: "Also this" });
  const steer = commandsOf(f, "steer")[0] as Extract<HarnessCommand, { type: "steer" }>;
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(await f.store.turns.get(turn.turnId)).toMatchObject({
    status: "needs_attention",
    attentionReason: "uncertain_input",
  });
  expect((await f.runtime.agents())[0]?.state).toBe("needs_you");
  expect(f.turns()).toHaveLength(1);

  await f.runtime.resendItem(steer.inputId);
  await f.settle();
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("completed");
  expect(lastTurn(f).input.inputIds).toEqual([steer.inputId]);
});

test("the owner can discard an uncertain message instead", async () => {
  const f = await started({ capabilities: { steer: true, steerEvidence: true } });
  const { conversationId } = await f.message();
  const turn = lastTurn(f);
  await f.message({ conversationId, body: "Also this" });
  const steer = commandsOf(f, "steer")[0] as Extract<HarnessCommand, { type: "steer" }>;
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  await f.runtime.discardItem(steer.inputId);
  expect((await f.store.inbox.get(steer.inputId))!.status).toBe("dropped");
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("completed");
  // oxlint-disable-next-line typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations.
  await expect(f.runtime.discardItem(steer.inputId)).rejects.toThrow();
});

test("Stop ends with the host's terminal event 15 s after the interrupt, as cancelled", async () => {
  const f = await started();
  await f.message();
  const turn = lastTurn(f);
  await f.runtime.stop(turn.turnId);
  await f.advance(14_000);
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("stopping");
  await f.advance(1_000);
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("cancelled");
  // The host closes the native session whose state is unknown.
  expect(f.nativeSessions()).toEqual([]);
});

test("Stop that the host never answers closes the native session after 20 s, as cancelled", async () => {
  const f = await started();
  await f.message();
  const turn = lastTurn(f);
  f.hooks.command = (command) =>
    command.type === "interrupt" ? Promise.reject(new CodeError("timeout")) : undefined;
  await f.runtime.stop(turn.turnId);
  f.hooks.command = undefined;
  await f.advance(19_000);
  expect(commandsOf(f, "close")).toEqual([]);
  await f.advance(1_000);
  expect(commandsOf(f, "close")).toMatchObject([{ sessionId: turn.sessionId }]);
  // The adapter ends the turn as failed on close; the owner's stop still decides.
  expect(await f.store.turns.get(turn.turnId)).toMatchObject({
    status: "cancelled",
    attentionReason: null,
  });

  await f.message({ threadId: crypto.randomUUID() });
  expect(f.turns()).toHaveLength(2);
});

test("a Send now interrupt that the host never answers is interrupted with its resume note", async () => {
  const f = await started();
  f.ownerMessage({ body: "First" });
  await f.runtime.sync();
  await f.advance(600);
  const first = lastTurn(f);
  f.ownerMessage({ threadId: crypto.randomUUID(), body: "Urgent" });
  await f.runtime.sync();
  await f.advance(600);
  const [held] = await f.store.inbox.waitingOwnerItems(organizationId, f.now());
  f.hooks.command = (command) =>
    command.type === "interrupt" ? Promise.reject(new CodeError("timeout")) : undefined;
  await f.runtime.sendNow(held!.id);
  f.hooks.command = undefined;
  await f.advance(20_000);
  expect((await f.store.turns.get(first.turnId))!.status).toBe("interrupted");
  const items = await f.store.inbox.openForSessions([first.sessionId]);
  expect(items.map((item) => item.source)).toContain("recovery");
});

test("an interrupt that finds no live turn finishes the turn at once", async () => {
  const f = await started();
  await f.message();
  const turn = lastTurn(f);
  f.hooks.command = (command) =>
    command.type === "interrupt" ? Promise.reject(new CodeError("no-live-turn")) : undefined;
  await f.runtime.stop(turn.turnId);
  await f.settle();
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("cancelled");
});

test("wakes this desktop cannot run are acknowledged so that newer wakes are pulled", async () => {
  const f = await started();
  for (let index = 0; index < 60; index++)
    f.wakes.push({
      id: crypto.randomUUID(),
      userAgentId: crypto.randomUUID(),
      source: "owner_message",
      sourceRef: {
        messageId: crypto.randomUUID(),
        conversationId: crypto.randomUUID(),
        threadId: null,
        kind: "direct_message",
      },
      sessionKey: `dm:${crypto.randomUUID()}`,
      dedupeKey: `msg:${crypto.randomUUID()}`,
      createdAt: new Date(f.now()).toISOString(),
      request: null,
    });
  await f.message();
  expect(f.acked.size).toBe(61);
  expect(f.turns()).toHaveLength(1);
});

test("an outage while loading messages requeues the work with backoff instead of asking the owner", async () => {
  const f = await started();
  f.outage.sources = true;
  const { conversationId } = await f.message();
  expect(f.turns()).toEqual([]);
  expect(await f.store.turns.needsAttention(organizationId)).toEqual([]);
  const [session] = await f.store.sessions.forConversation(organizationId, conversationId);
  const [waiting] = await f.store.inbox.openForSessions([session!.id]);
  expect(waiting).toMatchObject({ status: "pending", turnId: null });
  expect(waiting!.availableAt).toBeGreaterThan(f.now());

  f.outage.sources = false;
  await f.advance(waiting!.availableAt - f.now());
  expect(f.turns()).toHaveLength(1);
});

test("a harness that is not connected requeues the work instead of asking the owner", async () => {
  const f = await started();
  f.hooks.command = (command) =>
    command.type === "open" ? Promise.reject(new CodeError("not-connected")) : undefined;
  await f.message();
  expect(await f.store.turns.needsAttention(organizationId)).toEqual([]);
  f.hooks.command = undefined;
  await f.advance(60_000);
  expect(f.turns()).toHaveLength(1);
});

test("an open before the worker has the organization's configuration requeues and synchronizes", async () => {
  const f = await started();
  // The controller's configure is still on its way, or failed: the host has no configuration.
  f.hooks.command = (command) =>
    command.type === "open"
      ? Promise.reject(new CodeError("organization-not-configured"))
      : undefined;
  await f.message();
  expect(await f.store.turns.needsAttention(organizationId)).toEqual([]);
  const synchronized = f.synchronizations.count;
  f.hooks.command = undefined;
  await f.advance(60_000);
  expect(f.turns()).toHaveLength(1);
  expect(f.synchronizations.count).toBe(synchronized + 1);
});

test("a started turn whose turn command fails transiently follows recovery, never stays running", async () => {
  const f = await started();
  f.hooks.command = (command, next) => {
    if (command.type !== "turn") return undefined;
    f.hooks.command = undefined;
    return next().then(() => {
      // The host started the native turn, but its answer was lost.
      f.emitFor(command, { type: "turn.started" });
      throw new CodeError("timeout");
    });
  };
  await f.message();
  const [first] = f.turns() as TurnCommand[];
  // The native turn of unknown state is closed, then the turn continues once.
  expect(commandsOf(f, "close")).toMatchObject([{ sessionId: first!.sessionId }]);
  const continued = lastTurn(f);
  expect(continued).toMatchObject({ turnId: first!.turnId, generation: 2 });
  expect(f.runtime.liveTurnIds()).toEqual([first!.turnId]);
  expect(await f.store.turns.get(first!.turnId)).toMatchObject({ attempt: 2, recoveries: 1 });

  await f.emit(continued.turnId, { type: "turn.completed", result: { status: "completed" } });
  await f.message({ threadId: crypto.randomUUID() });
  expect(f.turns()).toHaveLength(3);
});

test("a catalog outage while a turn starts waits and retries instead of asking the owner", async () => {
  const f = await started();
  const { conversationId } = f.ownerMessage();
  await f.runtime.sync();
  f.outage.catalogLookup = true;
  await f.advance(600);
  expect(f.turns()).toEqual([]);
  expect(await f.store.turns.needsAttention(organizationId)).toEqual([]);
  const [session] = await f.store.sessions.forConversation(organizationId, conversationId);
  const [waiting] = await f.store.inbox.openForSessions([session!.id]);
  expect(waiting).toMatchObject({ status: "pending", turnId: null });

  f.outage.catalogLookup = false;
  await f.advance(waiting!.availableAt - f.now());
  expect(f.turns()).toHaveLength(1);
});

test("a failure without a known code stops retrying after 6 backoffs and needs the owner", async () => {
  const f = await started();
  f.hooks.command = (command) =>
    command.type === "open" ? Promise.reject(new Error("Invalid session ref.")) : undefined;
  await f.message();
  for (let index = 0; index < 6; index++) {
    expect(await f.store.turns.needsAttention(organizationId)).toEqual([]);
    await f.advance(outageBackoffMaxMs);
  }
  expect(commandsOf(f, "open")).toHaveLength(7);
  const [attention] = await f.store.turns.needsAttention(organizationId);
  expect(await f.store.turns.get(attention!.id)).toMatchObject({ attentionReason: "failed" });
  await f.advance(outageBackoffMaxMs);
  expect(commandsOf(f, "open")).toHaveLength(7);
});

test("a known outage keeps waiting past the retry cap", async () => {
  const f = await started();
  f.hooks.command = (command) =>
    command.type === "open" ? Promise.reject(new CodeError("not-connected")) : undefined;
  await f.message();
  for (let index = 0; index < 10; index++) await f.advance(outageBackoffMaxMs);
  expect(await f.store.turns.needsAttention(organizationId)).toEqual([]);
  expect(commandsOf(f, "open").length).toBeGreaterThan(7);
});

test("a blocking request that the server cannot open is denied at once", async () => {
  const f = await started();
  await f.message();
  const turn = lastTurn(f);
  await f.emit(turn.turnId, { type: "turn.started" });
  f.outage.openRequest = true;
  const data = { toolName: "Bash", input: { command: "ls" } };
  await f.emit(turn.turnId, { type: "request.opened", requestId: "n1", kind: "permission", data });
  expect(f.commands.at(-1)).toMatchObject({ type: "respond", requestId: "n1", response: "deny" });
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("running");
});

test("a request that opens on the server after its turn ended is closed", async () => {
  const f = await started();
  await f.message();
  const turn = lastTurn(f);
  await f.emit(turn.turnId, { type: "turn.started" });
  const opening = deferred<{ id: string; status: string }>();
  f.hooks.openRequest = () => opening.promise;
  const data = { toolName: "Bash", input: { command: "ls" } };
  f.runtime.onHarnessEvent({
    type: "request.opened",
    requestId: "n1",
    kind: "permission",
    data,
    sessionId: turn.sessionId,
    organizationId,
    turnId: turn.turnId,
    generation: turn.generation,
    timestamp: f.now(),
  });
  await f.settle();
  f.runtime.onHarnessEvent({
    type: "turn.completed",
    result: { status: "completed" },
    sessionId: turn.sessionId,
    organizationId,
    turnId: turn.turnId,
    generation: turn.generation,
    timestamp: f.now(),
  });
  opening.resolve({ id: "server-1", status: "pending" });
  await f.settle();
  expect(closedStatuses(f)).toEqual([{ requestId: "server-1", status: "cancelled" }]);
});

test("after a restart, server requests of interrupted turns are closed as orphaned", async () => {
  const location = await openStore();
  try {
    const before = await runtimeFixture({ path: location.path });
    await before.runtime.start();
    await before.message();
    const turn = lastTurn(before);
    await before.emit(turn.turnId, { type: "turn.started" });
    before.hooks.openRequest = async () => ({ id: "server-1", status: "pending" });
    await before.emit(turn.turnId, {
      type: "request.opened",
      requestId: "n1",
      kind: "permission",
      data: { toolName: "Bash", input: { command: "ls" } },
    });
    before.runtime.dispose();
    before.store.close();

    const f = await started({ path: location.path });
    expect(closedStatuses(f)).toEqual([{ requestId: "server-1", status: "orphaned" }]);
  } finally {
    await fixture?.close();
    fixture = undefined;
    await location.remove();
  }
});

async function helperTurn(f: RuntimeFixture) {
  await f.message();
  const main = lastTurn(f);
  const result = await f.runtime.handleLocalTool({
    tool: "start_helper",
    sessionId: main.sessionId,
    organizationId,
    agentId,
    input: { requestId: crypto.randomUUID(), task: "Research" },
    turn: main.context,
  });
  if (!result.success) throw new Error("start_helper failed.");
  await f.settle();
  const helper = f.turns().find((command) => command.sessionId !== main.sessionId)!;
  return { main, helper, helperId: (result.data as { helperId: string }).helperId };
}

test("a helper whose turn fails ends as failed, and its parent is told", async () => {
  const f = await started();
  const { main, helper, helperId } = await helperTurn(f);
  await f.emit(helper.turnId, {
    type: "turn.completed",
    result: { status: "failed", error: "Crashed." },
  });
  expect((await f.store.helpers.get(helperId))!.status).toBe("failed");
  const parentItems = await f.store.inbox.openForSessions([main.sessionId]);
  expect(parentItems.map((row) => row.source)).toContain("helper_result");
});

test("a helper whose agent moved away ends as failed when its turn starts, and its parent is told", async () => {
  const f = await started();
  const { main, helper, helperId } = await helperTurn(f);
  await f.emit(helper.turnId, { type: "turn.started" });
  // The app restarts after the agent moved: the helper's turn would continue, but not here.
  f.catalog[0]!.home = false;
  await f.restart();
  expect((await f.store.turns.get(helper.turnId))!.status).toBe("interrupted");
  expect((await f.store.helpers.get(helperId))!.status).toBe("failed");
  const parentItems = await f.store.inbox.openForSessions([main.sessionId]);
  expect(parentItems.map((row) => row.source)).toContain("helper_result");
});

test("a helper whose session closes while it stops, without a way to resume, ends as failed", async () => {
  const f = await started();
  const { helper, helperId } = await helperTurn(f);
  await f.emit(helper.turnId, { type: "turn.started" });
  await f.store.turns.stopping(helper.turnId, "moved");
  await f.emit(helper.turnId, { type: "session.closed", reason: "worker_exited" });
  expect((await f.store.turns.get(helper.turnId))!.status).toBe("interrupted");
  expect((await f.store.helpers.get(helperId))!.status).toBe("failed");
});

test("a handoff closes the native session before the epoch rotates, and rotates once", async () => {
  const f = await started();
  const { conversationId } = await f.message();
  const first = lastTurn(f);
  await f.emit(first.turnId, { type: "turn.completed", result: { status: "completed" } });
  const firstOpen = commandsOf(f, "open")[0] as OpenCommand;
  expect(firstOpen.epoch).toBe(0);

  await f.runtime.newTopic(conversationId);
  await f.settle();
  const handoff = lastTurn(f);
  expect(handoff.context).toMatchObject({ purpose: "handoff", installationId });
  const handoffOpen = commandsOf(f, "open").at(-1) as OpenCommand;
  expect(handoffOpen).toMatchObject({ epoch: 0, prefix: firstOpen.prefix });

  const epochAtClose: number[] = [];
  f.hooks.command = (command) => {
    if (command.type !== "close") return undefined;
    return f.store.sessions.get(command.sessionId).then((session) => {
      epochAtClose.push(session!.epoch);
    });
  };
  await f.emit(handoff.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect(epochAtClose).toEqual([0]);
  expect(await f.store.sessions.get(first.sessionId)).toMatchObject({ epoch: 1, rotation: null });

  f.hooks.command = undefined;
  await f.message({ conversationId });
  const next = commandsOf(f, "open").at(-1) as OpenCommand;
  expect(next).toMatchObject({ epoch: 1 });
  expect(next.nativeSessionId).toBeUndefined();
});

test("New topic stops new messages from steering into the old epoch", async () => {
  const f = await started({ capabilities: { steer: true, steerEvidence: true } });
  const { conversationId } = await f.message();
  await f.runtime.newTopic(conversationId);
  await f.message({ conversationId, body: "New subject" });
  expect(commandsOf(f, "steer")).toEqual([]);
});

test("owner messages are held, not steered, while an unattended turn of their session runs", async () => {
  const f = await started({ capabilities: { steer: true, steerEvidence: true } });
  const { conversationId } = await f.message();
  const first = lastTurn(f);
  await f.emit(first.turnId, { type: "turn.completed", result: { status: "completed" } });
  await f.store.inbox.intake(
    [
      {
        sessionId: first.sessionId,
        userAgentId: agentId,
        source: "recovery",
        sourceRef: { source: "recovery", turnId: first.turnId },
        lane: "system",
        dedupeKey: "recovery:test",
        body: "Continue.",
      },
    ],
    f.now(),
  );
  await f.message({ conversationId });
  expect(lastTurn(f).mode).toBe("unattended");
  await f.message({ conversationId, body: "Now this" });
  expect(commandsOf(f, "steer")).toEqual([]);
  const held = await f.store.inbox.waitingOwnerItems(organizationId, f.now());
  expect(held.every((row) => row.held)).toBe(true);
});

test("status versions are milliseconds and never go down, also after a restart", async () => {
  const location = await openStore();
  try {
    const start = Date.parse("2026-06-01T10:00:00Z");
    const before = await runtimeFixture({ path: location.path, now: start });
    await before.runtime.start();
    await before.message();
    await before.advance(500);
    const versions = () =>
      before.posts
        .filter((post) => post.method === "status")
        .map((post) => (post.body as { version: number }).version);
    expect(versions().at(-1)).toBeGreaterThanOrEqual(start);
    await before.emit(lastTurn(before).turnId, {
      type: "turn.completed",
      result: { status: "completed" },
    });
    await before.advance(500);
    const published = versions();
    expect(published).toEqual([...published].sort((a, b) => a - b));
    const last = published.at(-1)!;
    before.runtime.dispose();
    before.store.close();

    const f = await started({ path: location.path, now: start + 2000 });
    await f.message();
    await f.advance(500);
    const after = f.posts
      .filter((post) => post.method === "status")
      .map((post) => (post.body as { version: number }).version);
    expect(after.at(-1)).toBeGreaterThan(last);
  } finally {
    await fixture?.close();
    fixture = undefined;
    await location.remove();
  }
});

test("an agent moved to another desktop stops its routines and its live work", async () => {
  const f = await started();
  await f.message();
  const turn = lastTurn(f);
  const routine = await f.runtime.routines.create({
    agentId,
    name: "Daily",
    prompt: "Summarize.",
    cron: "* * * * *",
    timezone: "UTC",
    enabled: true,
    destination: null,
  });
  await f.runtime.routines.approve({ routineId: routine.id, revision: routine.revision });

  f.catalog[0]!.home = false;
  await f.runtime.reconcileHome();
  await f.settle();
  expect(commandsOf(f, "interrupt")).toMatchObject([{ turnId: turn.turnId }]);
  expect(commandsOf(f, "close")).toMatchObject([{ sessionId: turn.sessionId }]);
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("interrupted");

  await f.advance(5 * 60_000);
  expect(await f.runtime.routines.tick()).toBe(0);
  const sessions = await f.store.sessions.forAgent(organizationId, agentId);
  expect(sessions.some((session) => session.kind === "routine")).toBe(false);
  await f.message();
  expect(f.turns()).toHaveLength(1);
});

test("native output outside our turns is a note on the session's latest turn", async () => {
  const f = await started();
  await f.message();
  const turn = lastTurn(f);
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  await f.event({
    type: "text",
    text: "Background output",
    sessionId: turn.sessionId,
    turnId: null,
    generation: null,
  });
  const events = await f.store.events.list(turn.turnId);
  expect(events.at(-1)).toMatchObject({ kind: "note", data: { text: "Background output" } });
});

test("native compaction holds the agent's slot until it finishes", async () => {
  const f = await started({ capabilities: { compact: true, usage: true } });
  await f.message();
  const turn = lastTurn(f);
  const compacting = deferred();
  f.hooks.command = (command) => (command.type === "compact" ? compacting.promise : undefined);
  f.ownerMessage({ threadId: crypto.randomUUID() });
  await f.emit(turn.turnId, {
    type: "turn.completed",
    result: { status: "completed", usage: { contextUsed: 90, contextWindow: 100 } },
  });
  await f.runtime.sync();
  await f.advance(600);
  expect(commandsOf(f, "compact")).toHaveLength(1);
  expect(f.turns()).toHaveLength(1);
  compacting.resolve(undefined);
  await f.settle();
  await f.advance(10);
  expect(f.turns()).toHaveLength(2);
});
