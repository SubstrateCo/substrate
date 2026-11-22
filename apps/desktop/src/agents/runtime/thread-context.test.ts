import { CodeError, organizationId, runtimeFixture, type RuntimeFixture } from "./test-support.ts";
import { afterEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

let fixture: RuntimeFixture | undefined;
afterEach(async () => {
  await fixture?.close();
});

async function started() {
  fixture = await runtimeFixture({ capabilities: { steer: true, steerEvidence: true } });
  await fixture.runtime.start();
  await fixture.message({ threadId: crypto.randomUUID() });
  return fixture;
}

test("other agents' thread messages steer one live turn as a batch, without self echoes", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  const place = {
    conversationId: session!.originConversationId!,
    threadId: session!.originThreadId,
  };
  f.threadMessage(place, { body: "Cost is 200", authorKind: "agent" });
  f.threadMessage(place, { body: "Risk is low", authorKind: "agent" });
  f.threadMessage(place, { body: "My own output", originTurnId: turn.turnId });
  await f.runtime.sync();
  await f.advance(600);
  const steers = f.commands.filter((command) => command.type === "steer");
  expect(steers).toHaveLength(1);
  expect(steers[0]!.text).toContain("Cost is 200");
  expect(steers[0]!.text).toContain("Risk is low");
  expect(steers[0]!.text).toContain('author_kind="agent"');
  expect(steers[0]!.text).not.toContain("My own output");
  await f.runtime.sync();
  await f.advance(600);
  expect(f.commands.filter((command) => command.type === "steer")).toHaveLength(1);
  expect(f.turns()).toHaveLength(1);
});

test("messages arriving across syncs share the open debounce window", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  const place = {
    conversationId: session!.originConversationId!,
    threadId: session!.originThreadId,
  };
  f.threadMessage(place, { body: "First update" });
  await f.runtime.sync();
  await f.advance(200);
  f.threadMessage(place, { body: "Second update" });
  await f.runtime.sync();
  await f.advance(400);
  expect(f.commands.filter((command) => command.type === "steer")).toEqual([]);
  await f.advance(200);
  const steers = f.commands.filter((command) => command.type === "steer");
  expect(steers).toHaveLength(1);
  expect(steers[0]!.text).toContain("First update");
  expect(steers[0]!.text).toContain("Second update");
});

test("an explicit call committed during thread sync is delivered only through its wake", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  const place = {
    conversationId: session!.originConversationId!,
    threadId: session!.originThreadId!,
  };
  f.hooks.threadMessages = () => {
    f.hooks.threadMessages = undefined;
    const id = f.threadMessage(place, { body: "Explicit follow-up", authorKind: "owner" });
    f.wakes.push({
      id: crypto.randomUUID(),
      userAgentId: session!.userAgentId,
      source: "owner_message",
      sourceRef: { messageId: id, ...place, kind: "mention" },
      sessionKey: session!.key,
      dedupeKey: `msg:${id}`,
      createdAt: new Date(f.now()).toISOString(),
      request: null,
    });
  };
  await f.runtime.sync();
  await f.advance(600);
  const steers = f.commands.filter((command) => command.type === "steer");
  expect(steers).toHaveLength(1);
  expect(steers[0]!.text).toContain('source="owner_message"');
  expect(
    (await f.store.inbox.forTurn(organizationId, turn.turnId)).filter(
      (item) => item.source === "thread_context",
    ),
  ).toEqual([]);
});

test("thread context never starts work after completion, including a pending batch", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  f.threadMessage(
    { conversationId: session!.originConversationId!, threadId: session!.originThreadId },
    { body: "Late update", authorKind: "agent" },
  );
  await f.runtime.sync();
  await f.emit(turn.turnId, { type: "turn.completed", result: { status: "completed" } });
  await f.advance(600);
  await f.runtime.sync();
  await f.advance(600);
  expect(f.commands.filter((command) => command.type === "steer")).toEqual([]);
  expect(f.turns()).toHaveLength(1);
  expect((await f.store.inbox.queuedCounts(organizationId)).size).toBe(0);
  expect((await f.store.turns.get(turn.turnId))?.status).toBe("completed");
});

test("passive context cannot use Send now to interrupt a turn", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  f.threadMessage(
    { conversationId: session!.originConversationId!, threadId: session!.originThreadId },
    { body: "Passive update" },
  );
  await f.runtime.sync();
  const pending = (await f.store.inbox.forTurn(organizationId, turn.turnId)).find(
    (item) => item.source === "thread_context",
  )!;
  await rejects(f.runtime.sendNow(pending.id), /Context updates cannot interrupt work/);
  expect(f.commands.filter((command) => command.type === "interrupt")).toEqual([]);
});

test("a harness without steering does not queue or interrupt passive context", async () => {
  fixture = await runtimeFixture();
  const f = fixture;
  await f.runtime.start();
  await f.message({ threadId: crypto.randomUUID() });
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  f.threadMessage(
    { conversationId: session!.originConversationId!, threadId: session!.originThreadId },
    { body: "Update", authorKind: "agent" },
  );
  await f.runtime.sync();
  await f.advance(600);
  expect(
    f.commands.filter((command) => command.type === "steer" || command.type === "interrupt"),
  ).toEqual([]);
  expect((await f.store.inbox.queuedCounts(organizationId)).size).toBe(0);
});

test("the owner's thread-updates switch disables passive steering, not explicit requests", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  f.catalog[0]!.threadContextEnabled = false;
  f.threadMessage(
    { conversationId: session!.originConversationId!, threadId: session!.originThreadId },
    { body: "Do not deliver" },
  );
  await f.runtime.sync();
  await f.advance(600);
  expect(f.commands.filter((command) => command.type === "steer")).toEqual([]);
  await f.message({
    conversationId: session!.originConversationId!,
    threadId: session!.originThreadId!,
    body: "Explicit request",
  });
  expect(f.commands.filter((command) => command.type === "steer")).toHaveLength(1);
});

test("more than one page of new messages is delivered in bounded batches", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  const place = {
    conversationId: session!.originConversationId!,
    threadId: session!.originThreadId,
  };
  for (let index = 0; index < 61; index++) f.threadMessage(place, { body: `Finding ${index}` });
  await f.runtime.sync();
  await f.advance(600);
  const steers = f.commands.filter((command) => command.type === "steer");
  expect(steers).toHaveLength(4);
  const batches = (await f.store.inbox.forTurn(organizationId, turn.turnId)).filter(
    (item) => item.source === "thread_context",
  );
  const ids = batches.flatMap((item) =>
    item.sourceRef.source === "thread_context" ? item.sourceRef.messageIds : [],
  );
  expect(ids).toHaveLength(61);
  expect(new Set(ids).size).toBe(61);
});

test("agent chatter stops at the per-turn batch budget", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  const place = {
    conversationId: session!.originConversationId!,
    threadId: session!.originThreadId,
  };
  for (let index = 0; index < 21; index++) {
    f.threadMessage(place, { body: `Exchange ${index}` });
    await f.runtime.sync();
    await f.advance(600);
  }
  expect(f.commands.filter((command) => command.type === "steer")).toHaveLength(20);
  expect(f.turns()).toHaveLength(1);
  const events = await f.store.events.list(turn.turnId);
  expect(
    events.filter(
      (event) =>
        event.kind === "note" &&
        "text" in event.data &&
        event.data.text.includes("Stopped passive"),
    ),
  ).toHaveLength(1);
});

test("access is checked again before a context batch is delivered", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  const id = f.threadMessage(
    { conversationId: session!.originConversationId!, threadId: session!.originThreadId },
    { body: "Private update" },
  );
  await f.runtime.sync();
  f.revokeMessage(id);
  await f.advance(600);
  expect(f.commands.filter((command) => command.type === "steer")).toEqual([]);
  expect(
    (await f.store.inbox.forTurn(organizationId, turn.turnId)).find(
      (item) => item.source === "thread_context",
    ),
  ).toMatchObject({
    status: "dropped",
    reason: "source_inaccessible",
  });
});

test("an uncertain context delivery is not sent twice", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  f.hooks.command = (command) =>
    command.type === "steer" ? Promise.reject(new CodeError("harness-error")) : undefined;
  f.threadMessage(
    { conversationId: session!.originConversationId!, threadId: session!.originThreadId },
    { body: "Update" },
  );
  await f.runtime.sync();
  await f.advance(600);
  await f.runtime.sync();
  await f.advance(600);
  expect(f.commands.filter((command) => command.type === "steer")).toHaveLength(1);
  expect(
    (await f.store.inbox.forTurn(organizationId, turn.turnId)).find(
      (item) => item.source === "thread_context",
    )?.status,
  ).toBe("uncertain");
});

test("passive traffic has a fixed window, but an owner request can still steer", async () => {
  const f = await started();
  const turn = f.turns()[0]!;
  const session = await f.store.sessions.get(turn.sessionId);
  await f.advance(10 * 60_000);
  f.threadMessage(
    { conversationId: session!.originConversationId!, threadId: session!.originThreadId },
    { body: "More agent chatter" },
  );
  await f.runtime.sync();
  await f.advance(600);
  expect(f.commands.filter((command) => command.type === "steer")).toEqual([]);
  await f.message({
    conversationId: session!.originConversationId!,
    threadId: session!.originThreadId!,
    body: "Please finish now",
  });
  const steers = f.commands.filter((command) => command.type === "steer");
  expect(steers).toHaveLength(1);
  expect(steers[0]!.text).toContain("Please finish now");
  expect(f.turns()).toHaveLength(1);
});

test("the next authorized turn includes messages posted while the agent was idle", async () => {
  const f = await started();
  const first = f.turns()[0]!;
  const session = await f.store.sessions.get(first.sessionId);
  await f.emit(first.turnId, { type: "turn.completed", result: { status: "completed" } });
  f.threadMessage(
    { conversationId: session!.originConversationId!, threadId: session!.originThreadId },
    { body: "Idle finding" },
  );
  await f.message({
    conversationId: session!.originConversationId!,
    threadId: session!.originThreadId!,
    body: "Summarize",
  });
  expect(f.turns()).toHaveLength(2);
  expect(f.turns()[1]!.input.text).toContain("Idle finding");
  expect(f.turns()[1]!.input.text).toContain('source="thread_context"');
});

test("two activated agents receive each other's findings without starting extra turns", async () => {
  const first = "00000000-0000-4000-8000-0000000000a1";
  const second = "00000000-0000-4000-8000-0000000000a2";
  fixture = await runtimeFixture({
    capabilities: { steer: true, steerEvidence: true },
    agents: [first, second].map((id) => ({
      id,
      name: id === first ? "Research" : "Finance",
      harness: "opencode",
      enabled: true,
      home: true,
      threadContextEnabled: true,
    })),
  });
  const f = fixture;
  await f.runtime.start();
  const place = { conversationId: crypto.randomUUID(), threadId: crypto.randomUUID() };
  f.ownerMessage({ ...place, userAgentId: first, body: "Research vendors" });
  f.ownerMessage({ ...place, userAgentId: second, body: "Price vendors" });
  await f.runtime.sync();
  await f.advance(600);
  expect(f.turns()).toHaveLength(2);
  const [a, b] = f.turns();
  f.threadMessage(place, { body: "Research finding", originTurnId: a!.turnId });
  f.threadMessage(place, { body: "Finance finding", originTurnId: b!.turnId });
  await f.runtime.sync();
  await f.advance(600);
  const steers = f.commands.filter((command) => command.type === "steer");
  expect(steers.find((command) => command.turnId === a!.turnId)?.text).toContain("Finance finding");
  expect(steers.find((command) => command.turnId === a!.turnId)?.text).not.toContain(
    "Research finding",
  );
  expect(steers.find((command) => command.turnId === b!.turnId)?.text).toContain(
    "Research finding",
  );
  expect(f.turns()).toHaveLength(2);
});
