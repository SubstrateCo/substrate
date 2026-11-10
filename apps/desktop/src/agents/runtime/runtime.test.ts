import type { HarnessCommand } from "@startup-os/contracts/harness";

import { agentId, openStore, organizationId, runtimeFixture } from "./test-support.ts";
import { afterEach, expect, test } from "bun:test";

/* oxlint-disable deslop/no-unknown-parameters, deslop/require-safety-comment-for-type-assertion -- Recorded fake server bodies and harness commands are untyped, as the real boundaries are. */

let fixture: Awaited<ReturnType<typeof runtimeFixture>> | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

type TurnCommand = Extract<HarnessCommand, { type: "turn" }>;

async function started(options: Parameters<typeof runtimeFixture>[0] = {}) {
  fixture = await runtimeFixture(options);
  await fixture.runtime.start();
  await fixture.settle();
  return fixture;
}

test("an owner message runs after the debounce, its events are stored, and a quiet turn is silent", async () => {
  const f = await started();
  f.ownerMessage({ body: "Status?" });
  await f.runtime.sync();
  await f.settle();
  expect(f.turns()).toEqual([]);

  await f.advance(600);
  const [turn] = f.turns() as [TurnCommand];
  expect(turn.mode).toBe("interactive");
  expect(turn.input.text).toContain(">Status?</item>");
  expect(turn.context).toMatchObject({ turnId: turn.turnId, attempt: 1, kind: "interactive" });

  await f.emit(turn.turnId, { type: "turn.started" });
  await f.emit(turn.turnId, {
    type: "item.started",
    itemId: "i1",
    itemType: "mcp",
    title: "search",
  });
  await f.emit(turn.turnId, { type: "item.completed", itemId: "i1", status: "completed" });
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect((await f.store.events.list(turn.turnId)).map((event) => event.kind)).toEqual([
    "turn_started",
    "tool_started",
    "tool_completed",
    "turn_finished",
  ]);
  expect(await f.store.turns.get(turn.turnId)).toMatchObject({
    status: "completed",
    outcome: "silent",
  });
});

test("a message the owner can no longer see is dropped and starts no turn", async () => {
  const f = await started();
  f.ownerMessage({ visible: false });
  await f.runtime.sync();
  await f.advance(600);
  expect(f.turns()).toEqual([]);
  const [session] = await f.store.sessions.forAgent(organizationId, agentId);
  const turns = await f.store.turns.forSessions([session!.id]);
  expect(turns).toEqual([]);
});

test("a reply recorded from the MCP call makes the turn replied", async () => {
  const f = await started();
  const { conversationId } = f.ownerMessage();
  await f.runtime.sync();
  await f.advance(600);
  const [turn] = f.turns() as [TurnCommand];
  const messageId = crypto.randomUUID();
  await f.runtime.observeToolCall(
    { tool: "reply", input: { requestId: "r", body: "Done" }, turn: { turnId: turn.turnId } },
    {
      success: true,
      data: {
        messageId,
        conversationId,
        threadId: null,
        questionId: null,
        createdAt: new Date().toISOString(),
      },
    },
  );
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  const view = await f.runtime.conversation(conversationId);
  expect(view.turns[0]).toMatchObject({
    outcome: "replied",
    outputs: [{ kind: "message", id: messageId, conversationId, threadId: null }],
  });
  // A transcript link finds the same turn without the conversation's data.
  expect(await f.runtime.turn(turn.turnId)).toEqual(view.turns[0]!);
  expect(await f.runtime.turn(crypto.randomUUID())).toBeNull();
});

test("an answer wake runs a turn whose input carries the owner's answer, under the question", async () => {
  const f = await started();
  const conversationId = crypto.randomUUID();
  const anchorMessageId = crypto.randomUUID();
  const requestId = crypto.randomUUID();
  f.answerWake(
    {
      id: requestId,
      kind: "question",
      status: "resolved",
      payload: {
        type: "questions",
        title: "The agent has a question",
        questions: [
          {
            id: "answer",
            header: "",
            question: "Which week?",
            options: [],
            multiSelect: false,
            allowCustom: true,
          },
        ],
      },
      response: { type: "questions", answers: { answer: ["Next week"] } },
      outcome: null,
      anchorMessageId,
      conversationId,
      threadId: null,
    },
    `dm:${conversationId}`,
  );
  await f.runtime.sync();
  await f.settle();
  const [turn] = f.turns() as [TurnCommand];
  expect(turn.mode).toBe("interactive");
  expect(turn.input.text).toContain("Question: Which week?\nAnswer: Next week</item>");
  const view = await f.runtime.conversation(conversationId);
  expect(view.turns[0]?.requestAnchors).toEqual([{ requestId, anchorMessageId }]);
});

test("an asked question needs the owner only while the server still has it open", async () => {
  const f = await started();
  const { conversationId } = f.ownerMessage();
  await f.runtime.sync();
  await f.advance(600);
  const [turn] = f.turns() as [TurnCommand];
  const questionId = crypto.randomUUID();
  f.serverOpenRequests.add(questionId);
  await f.runtime.observeToolCall(
    { tool: "reply", input: { requestId: "r", body: "Which?" }, turn: { turnId: turn.turnId } },
    {
      success: true,
      data: {
        messageId: crypto.randomUUID(),
        conversationId,
        threadId: null,
        questionId,
        createdAt: new Date().toISOString(),
      },
    },
  );
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  expect((await f.runtime.agents())[0]?.state).toBe("needs_you");
  // The question's conversation was deleted: the request is gone and no answer wake comes.
  // The server's agent-work hint refreshes the open requests.
  f.serverOpenRequests.delete(questionId);
  f.runtime.hint();
  await f.advance(1_000);
  expect((await f.runtime.agents())[0]?.state).toBe("idle");
});

test("status reads during a burst of changes ask the server for open requests at most once", async () => {
  const f = await started();
  const { conversationId } = f.ownerMessage();
  await f.runtime.sync();
  await f.advance(600);
  const [turn] = f.turns() as [TurnCommand];
  const questionId = crypto.randomUUID();
  f.serverOpenRequests.add(questionId);
  await f.runtime.observeToolCall(
    { tool: "reply", input: { requestId: "r", body: "Which?" }, turn: { turnId: turn.turnId } },
    {
      success: true,
      data: {
        messageId: crypto.randomUUID(),
        conversationId,
        threadId: null,
        questionId,
        createdAt: new Date().toISOString(),
      },
    },
  );
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  const before = f.posts.filter((post) => post.method === "openRequestIds").length;
  for (let index = 0; index < 5; index++)
    expect((await f.runtime.agents())[0]?.state).toBe("needs_you");
  await f.advance(1_000);
  expect(
    f.posts.filter((post) => post.method === "openRequestIds").length - before,
  ).toBeLessThanOrEqual(1);
});

test("a tool start that only changes the activity publishes later, and a state change publishes at once", async () => {
  const f = await started();
  const statuses = () =>
    f.posts
      .filter((post) => post.method === "status")
      .map((post) => post.body as { state: string; activity?: string });
  await f.message();
  const [turn] = f.turns() as [TurnCommand];
  await f.emit(turn.turnId, { type: "turn.started" });
  await f.emit(turn.turnId, {
    type: "item.started",
    itemId: "i1",
    itemType: "mcp",
    title: "search",
  });
  await f.advance(1_000);
  expect(statuses().at(-1)).toMatchObject({ state: "working", activity: "search" });
  const published = statuses().length;

  await f.emit(turn.turnId, { type: "item.started", itemId: "i2", itemType: "mcp", title: "edit" });
  await f.advance(1_000);
  await f.emit(turn.turnId, { type: "item.started", itemId: "i3", itemType: "mcp", title: "read" });
  await f.advance(1_000);
  expect(statuses()).toHaveLength(published);

  // The throttle window ends: the latest activity goes out once.
  await f.advance(10_000);
  expect(statuses()).toHaveLength(published + 1);
  expect(statuses().at(-1)).toMatchObject({ state: "working", activity: "read" });

  await f.emit(turn.turnId, {
    type: "item.started",
    itemId: "i4",
    itemType: "mcp",
    title: "write",
  });
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  await f.advance(600);
  expect(statuses().at(-1)).toMatchObject({ state: "idle" });
});

test("a new message for the live session is steered when the harness can steer", async () => {
  const f = await started({ capabilities: { steer: true, steerEvidence: true } });
  const { conversationId } = f.ownerMessage();
  await f.runtime.sync();
  await f.advance(600);
  const [turn] = f.turns() as [TurnCommand];
  f.ownerMessage({ conversationId, body: "Also this" });
  await f.runtime.sync();
  await f.advance(600);
  const steer = f.commands.find((command) => command.type === "steer");
  expect(steer).toMatchObject({ turnId: turn.turnId, text: expect.stringContaining("Also this") });
  const item = await f.store.inbox.get(
    (steer as Extract<HarnessCommand, { type: "steer" }>).inputId,
  );
  expect(item).toMatchObject({ status: "submitted", steered: true, turnId: turn.turnId });

  await f.emit(turn.turnId, { type: "input.consumed", inputId: item!.id });
  expect((await f.store.inbox.get(item!.id))!.status).toBe("consumed");
});

test("without steer the message is held, and Send now interrupts and runs it next with a resume note later", async () => {
  const f = await started();
  f.ownerMessage({ body: "First" });
  await f.runtime.sync();
  await f.advance(600);
  const [first] = f.turns() as [TurnCommand];

  // Another session of the same agent shares the main slot.
  f.ownerMessage({ threadId: crypto.randomUUID(), body: "Urgent" });
  await f.runtime.sync();
  await f.advance(600);
  const held = (
    await f.store.inbox.waitingOwnerItems(organizationId, Number.MAX_SAFE_INTEGER)
  ).filter((row) => row.held);
  expect(held).toHaveLength(1);
  const waiting = held[0];
  expect(f.turns()).toHaveLength(1);

  await f.runtime.sendNow(waiting!.id);
  await f.settle();
  expect(f.commands.at(-1)).toMatchObject({ type: "interrupt", turnId: first.turnId });
  await f.emit(first.turnId, { type: "turn.completed", result: { status: "interrupted" } });
  expect((await f.store.turns.get(first.turnId))!.status).toBe("interrupted");

  const [, urgent] = f.turns() as TurnCommand[];
  expect(urgent!.input.inputIds).toEqual([waiting!.id]);
  await f.emit(urgent!.turnId, { type: "turn.completed", result: { status: "completed" } });
  const [, , resumed] = f.turns() as TurnCommand[];
  expect(resumed!.sessionId).toBe(first.sessionId);
  expect(resumed!.input.text).toContain(`<resume turn="${first.turnId}"`);
});

test("Stop cancels the live turn after the worker confirms", async () => {
  const f = await started();
  f.ownerMessage();
  await f.runtime.sync();
  await f.advance(600);
  const [turn] = f.turns() as [TurnCommand];
  await f.runtime.stop(turn.turnId);
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("stopping");
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "interrupted" } });
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("cancelled");
});

async function interruptedTurn(path: string) {
  // The first app run starts a turn, records a finished tool call, and dies.
  const before = await runtimeFixture({ path });
  await before.runtime.start();
  before.ownerMessage();
  await before.runtime.sync();
  await before.advance(600);
  const [turn] = before.turns() as [TurnCommand];
  await before.emit(turn.turnId, { type: "turn.started" });
  await before.emit(turn.turnId, {
    type: "item.started",
    itemId: "i1",
    itemType: "mcp",
    title: "search",
  });
  await before.emit(turn.turnId, { type: "item.completed", itemId: "i1", status: "completed" });
  before.runtime.dispose();
  before.store.close();
  return turn;
}

test("after a restart a safe turn continues once, resuming its native session", async () => {
  const location = await openStore();
  try {
    const turn = await interruptedTurn(location.path);
    const f = await started({ path: location.path });
    const open = f.commands.find((command) => command.type === "open");
    expect(open).toMatchObject({
      requireResume: true,
      nativeSessionId: `native-${turn.sessionId}`,
    });
    const [continued] = f.turns() as [TurnCommand];
    expect(continued).toMatchObject({
      turnId: turn.turnId,
      generation: 2,
      context: { attempt: 2 },
    });
    expect(continued.input.text).toContain("Finished: search");
  } finally {
    await fixture?.close();
    fixture = undefined;
    await location.remove();
  }
});

test("after a restart a turn whose native session cannot resume needs the owner", async () => {
  const location = await openStore();
  try {
    const turn = await interruptedTurn(location.path);
    const f = await started({ path: location.path, failOpen: true });
    expect(await f.store.turns.get(turn.turnId)).toMatchObject({
      status: "needs_attention",
      attentionReason: "resume_failed",
    });
    expect(f.turns()).toEqual([]);
  } finally {
    await fixture?.close();
    fixture = undefined;
    await location.remove();
  }
});

test("a blocking request opens on the server, gets the owner's answer, and expires as a denial", async () => {
  const f = await started();
  f.ownerMessage();
  await f.runtime.sync();
  await f.advance(600);
  const [turn] = f.turns() as [TurnCommand];
  const data = { toolName: "Bash", input: { command: "ls" } };
  await f.emit(turn.turnId, { type: "turn.started" });
  await f.emit(turn.turnId, { type: "request.opened", requestId: "n1", kind: "permission", data });
  const opened = f.posts.find((post) => post.method === "openRequest")!.body as { turnId: string };
  expect(opened).toMatchObject({ turnId: turn.turnId, nativeRequestId: "n1", mode: "blocking" });
  expect((await f.store.turns.get(turn.turnId))!.status).toBe("waiting");

  f.answer({
    requestId: "server-1",
    userAgentId: agentId,
    turnId: turn.turnId,
    nativeRequestId: "n1",
    response: { type: "approval", optionId: "allow" },
  });
  await f.runtime.sync();
  await f.settle();
  expect(f.commands.at(-1)).toMatchObject({ type: "respond", requestId: "n1", response: "allow" });

  await f.emit(turn.turnId, { type: "request.opened", requestId: "n2", kind: "permission", data });
  await f.advance(10 * 60_000);
  expect(f.commands.at(-1)).toMatchObject({ type: "respond", requestId: "n2", response: "deny" });
  expect(
    f.posts
      .filter((post) => post.method === "closeRequest")
      .map((post) => (post.body as { status: string }).status),
  ).toEqual(["delivered", "expired"]);
});

test("a burst of agent-work hints pulls once, and pulls answers only while a request is open", async () => {
  const f = await started();
  const calls = (method: string) => f.posts.filter((post) => post.method === method).length;
  const before = { wakes: calls("pullWakes"), answers: calls("requestAnswers") };
  for (let index = 0; index < 5; index++) f.runtime.hint();
  await f.advance(1_000);
  expect(calls("pullWakes")).toBe(before.wakes + 1);
  // No blocking request waits for an answer.
  expect(calls("requestAnswers")).toBe(before.answers);

  await f.message();
  const [turn] = f.turns() as [TurnCommand];
  await f.emit(turn.turnId, { type: "turn.started" });
  await f.emit(turn.turnId, {
    type: "request.opened",
    requestId: "n1",
    kind: "permission",
    data: { toolName: "Bash", input: { command: "ls" } },
  });
  f.answer({
    requestId: "server-1",
    userAgentId: agentId,
    turnId: turn.turnId,
    nativeRequestId: "n1",
    response: { type: "approval", optionId: "allow" },
  });
  const answers = calls("requestAnswers");
  for (let index = 0; index < 5; index++) f.runtime.hint();
  await f.advance(1_000);
  expect(calls("requestAnswers")).toBe(answers + 1);
  expect(f.commands.at(-1)).toMatchObject({ type: "respond", requestId: "n1", response: "allow" });
});

test("the tick pulls from the server while realtime is down, and only as a slow safety net while it is up", async () => {
  const f = await started();
  const pulls = () => f.posts.filter((post) => post.method === "pullWakes").length;
  let before = pulls();
  await f.tick();
  expect(pulls()).toBe(before + 1);

  f.realtime.connected = true;
  before = pulls();
  await f.advance(30_000);
  await f.tick();
  await f.advance(30_000);
  await f.tick();
  expect(pulls()).toBe(before);

  await f.advance(5 * 60_000);
  await f.tick();
  expect(pulls()).toBe(before + 1);
});

test("a helper runs in its own folder and its finish wakes the parent with the report", async () => {
  const f = await started();
  f.ownerMessage();
  await f.runtime.sync();
  await f.advance(600);
  const [main] = f.turns() as [TurnCommand];
  const call = (
    tool: string,
    sessionId: string,
    turn: TurnCommand,
    input: Record<string, string>,
  ) =>
    f.runtime.handleLocalTool({
      tool,
      sessionId,
      organizationId,
      agentId,
      input,
      turn: turn.context,
    });
  const started_ = await call("start_helper", main.sessionId, main, {
    requestId: crypto.randomUUID(),
    task: "Research",
  });
  if (!started_.success) throw new Error("start_helper failed.");
  expect(started_.data).toMatchObject({ status: "running" });
  const { helperId } = started_.data as { helperId: string };
  await f.settle();
  const helperOpen = f.commands.find(
    (command) => command.type === "open" && command.folder !== "main",
  ) as Extract<HarnessCommand, { type: "open" }>;
  expect(helperOpen.folder).toEqual({ helperId });
  const helperTurn = f
    .turns()
    .find((command) => command.sessionId === helperOpen.sessionId) as TurnCommand;
  expect(helperTurn.mode).toBe("unattended");

  expect(
    await call("finish_helper", helperOpen.sessionId, helperTurn, { report: "Found it." }),
  ).toEqual({
    success: true,
    data: { saved: true },
  });
  await f.emit(helperTurn.turnId, { type: "turn.completed", result: { status: "completed" } });
  await f.emit(main.turnId, { type: "turn.completed", result: { status: "completed" } });
  const next = f
    .turns()
    .filter((command) => command.sessionId === main.sessionId)
    .at(-1) as TurnCommand;
  expect(next.turnId).not.toBe(main.turnId);
  expect(next.input.text).toContain('source="helper_result"');
  expect(next.input.text).toContain(">Found it.</item>");
});

test("local tools reject calls that do not come from a live turn of the named session", async () => {
  const f = await started();
  const result = await f.runtime.handleLocalTool({
    tool: "list_helpers",
    sessionId: "not-a-session",
    organizationId,
    agentId,
    input: {},
    turn: {
      turnId: crypto.randomUUID(),
      attempt: 1,
      sessionKey: "dm:x",
      origin: null,
      kind: "interactive",
    },
  });
  expect(result).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
});
