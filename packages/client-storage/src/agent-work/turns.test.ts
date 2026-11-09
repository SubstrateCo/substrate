import { background, createSession, item, openTestStore } from "./test-support.ts";
import { laneAgingMs } from "./turns.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";

let fixture: Awaited<ReturnType<typeof openTestStore>>;
beforeEach(async () => {
  fixture = await openTestStore();
});
afterEach(() => fixture.cleanup());

test("an agent's sessions share one main slot, so only one of them runs at a time", async () => {
  const { store } = fixture;
  const dm = await createSession(store);
  const thread = await createSession(store, { kind: "thread" });
  await store.inbox.intake([item(dm), item(thread)], 0);

  const first = await store.turns.claim(1);
  expect(first).toHaveLength(1);
  expect(await store.turns.claim(2)).toEqual([]);

  await store.turns.finish(first[0]!.turn.id, { status: "completed" }, 3);
  const second = await store.turns.claim(4);
  expect(second.map((claimed) => claimed.session.id)).toEqual([
    first[0]!.session.id === dm.id ? thread.id : dm.id,
  ]);
});

test("the device runs at most three live turns", async () => {
  const { store } = fixture;
  for (const agent of ["a", "b", "c", "d"]) {
    const session = await createSession(store, { userAgentId: agent });
    await store.inbox.intake([item(session)], 0);
  }
  expect(await store.turns.claim(1)).toHaveLength(3);
  expect(await store.turns.claim(2)).toEqual([]);
});

test("free slots go to the owner lane first, then system, then background", async () => {
  const { store } = fixture;
  const agents = ["a", "b", "c", "d"];
  const sessions = await Promise.all(
    agents.map((agent) => createSession(store, { userAgentId: agent })),
  );
  await store.inbox.intake(
    [
      background(sessions[0]!),
      item(sessions[1]!, { lane: "system", dedupeKey: "system" }),
      item(sessions[2]!),
      background(sessions[3]!),
    ],
    0,
  );
  const claimed = await store.turns.claim(1, { deviceCap: 2 });
  expect(claimed.map((entry) => entry.session.userAgentId)).toEqual(["c", "b"]);
});

test("background work moves up one lane for every ten minutes it waits", async () => {
  const { store } = fixture;
  const waiting = await createSession(store, { userAgentId: "waiting" });
  const fresh = await createSession(store, { userAgentId: "fresh" });
  await store.inbox.intake([background(waiting)], 0);
  const now = 2 * laneAgingMs;
  await store.inbox.intake([item(fresh, { lane: "system", dedupeKey: "system" })], now);
  const claimed = await store.turns.claim(now, { deviceCap: 1 });
  expect(claimed.map((entry) => entry.session.userAgentId)).toEqual(["waiting"]);
});

test("main slots go before helper slots in the same lane", async () => {
  const { store } = fixture;
  const helper = await createSession(store, { userAgentId: "a", kind: "helper" });
  const main = await createSession(store, { userAgentId: "b" });
  await store.inbox.intake([item(helper, { lane: "system", dedupeKey: "h" })], 0);
  await store.inbox.intake([item(main, { lane: "system", dedupeKey: "m" })], 5);
  const claimed = await store.turns.claim(10, { deviceCap: 1 });
  expect(claimed.map((entry) => entry.session.id)).toEqual([main.id]);
});

test("a claim batches the session's available items and marks owner work interactive", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([background(session), item(session), item(session)], 0);
  await store.inbox.intake([item(session, { availableAt: 100 })], 0);
  const [claimed] = await store.turns.claim(1, { batchLimit: 20 });
  expect(claimed!.items).toHaveLength(3);
  expect(claimed!.turn.kind).toBe("interactive");
  expect((await store.inbox.forTurn(claimed!.turn.id)).map((row) => row.status)).toEqual([
    "submitted",
    "submitted",
    "submitted",
  ]);
});

test("helper turns are unattended even with owner-lane items", async () => {
  const { store } = fixture;
  const helper = await createSession(store, { kind: "helper" });
  await store.inbox.intake([item(helper)], 0);
  const [claimed] = await store.turns.claim(1);
  expect(claimed!.turn.kind).toBe("unattended");
});

test("events of a turn are numbered without gaps across appends", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1);
  const turnId = claimed!.turn.id;
  await store.events.append(turnId, [{ kind: "turn_started", data: {} }], 2);
  await Promise.all([
    store.events.append(turnId, [{ kind: "text", data: { text: "a" } }], 3),
    store.events.append(
      turnId,
      [
        {
          kind: "tool_started",
          itemId: "tool-1",
          data: { itemType: "mcp", title: "Using search" },
        },
        { kind: "tool_completed", itemId: "tool-1", data: { status: "completed" } },
      ],
      4,
    ),
  ]);
  const events = await store.events.list(turnId);
  expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
  expect((await store.events.list(turnId, 2)).map((event) => event.seq)).toEqual([3, 4]);
  expect((await store.turns.get(turnId))!.activity).toBe("Using search");
});

async function steeredTurn() {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1);
  const turnId = claimed!.turn.id;
  const steered = await store.inbox.intake([item(session), item(session), item(session)], 2);
  await store.turns.running(turnId, 2);
  for (const row of steered) await store.inbox.submitSteer(row.id, turnId);
  return { session, turnId, steered: steered.map((row) => row.id), batch: claimed!.items };
}

test("steered items settle by receipt: consumed, requeued to the front, or uncertain", async () => {
  const { store } = fixture;
  const { session, turnId, steered, batch } = await steeredTurn();
  // SAFETY: steeredTurn steers exactly three items.
  const [consumed, queued, unknown] = steered as [string, string, string];
  await store.inbox.consumed(turnId, consumed);
  await store.turns.finish(turnId, { status: "interrupted", stillQueuedInputIds: [queued] }, 3);
  const status = async (id: string) => (await store.inbox.get(id))!.status;
  expect(await status(batch[0]!.id)).toBe("consumed");
  expect(await status(consumed)).toBe("consumed");
  expect(await status(queued)).toBe("confirmed_unconsumed");
  expect(await status(unknown)).toBe("uncertain");

  // The uncertain item is never resent by itself: the session waits for the owner.
  await store.inbox.intake([item(session, { availableAt: 0 })], 0);
  expect(await store.turns.claim(10)).toEqual([]);
  expect(await status(unknown)).toBe("uncertain");

  // Once the owner decides, the requeued item goes before older pending items of its lane.
  await store.inbox.discard(unknown, 11);
  const [next] = await store.turns.claim(12, { batchLimit: 1 });
  expect(next!.items.map((row) => row.id)).toEqual([queued]);
});

test("recovery continues a turn once when every tool finished and no input is unconfirmed", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1);
  const turnId = claimed!.turn.id;
  await store.turns.running(turnId, 2);
  await store.events.append(
    turnId,
    [
      { kind: "tool_started", itemId: "t1", data: { itemType: "mcp", title: "search" } },
      { kind: "tool_completed", itemId: "t1", data: { status: "completed" } },
    ],
    3,
  );
  expect(await store.turns.recover(4)).toEqual([{ turnId, action: "continue" }]);
  const continued = (await store.turns.get(turnId))!;
  expect(continued).toMatchObject({ status: "assigned", attempt: 2, generation: 2 });

  await store.turns.running(turnId, 5);
  expect(await store.turns.recover(6)).toEqual([
    { turnId, action: "needs_attention", reason: "interrupted_again" },
  ]);
  expect((await store.turns.get(turnId))!.status).toBe("needs_attention");
});

test("recovery asks the owner when a tool call did not finish", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1);
  const turnId = claimed!.turn.id;
  await store.turns.running(turnId, 2);
  await store.events.append(
    turnId,
    [{ kind: "tool_started", itemId: "t1", data: { itemType: "mcp", title: "create_task" } }],
    3,
  );
  expect(await store.turns.recover(4)).toEqual([
    { turnId, action: "needs_attention", reason: "unfinished_tool" },
  ]);
});

test("recovery asks the owner when steered input was not confirmed, and marks it uncertain", async () => {
  const { store } = fixture;
  const { turnId, steered } = await steeredTurn();
  await store.turns.running(turnId, 2);
  expect(await store.turns.recover(4)).toEqual([
    { turnId, action: "needs_attention", reason: "uncertain_input" },
  ]);
  expect((await store.inbox.get(steered[0]!))!.status).toBe("uncertain");
});

test("recovery puts the items of a turn that never started back in the inbox", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1);
  expect(await store.turns.recover(2)).toEqual([{ turnId: claimed!.turn.id, action: "requeued" }]);
  const [again] = await store.turns.claim(3);
  expect(again!.items.map((row) => row.id)).toEqual(claimed!.items.map((row) => row.id));
});

test("dismissing a needs-attention turn drops its items", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1);
  await store.turns.attention(claimed!.turn.id, "failed", "Harness failed.", 2);
  expect((await store.inbox.get(claimed!.items[0]!.id))!.status).toBe("submitted");
  await store.turns.dismiss(claimed!.turn.id, 3);
  expect((await store.turns.get(claimed!.turn.id))!.status).toBe("cancelled");
  expect((await store.inbox.get(claimed!.items[0]!.id))!.status).toBe("dropped");
});

test("a claim takes only the active organization's work", async () => {
  const { store } = fixture;
  const other = await store.sessions.ensure(
    {
      organizationId: "org-2",
      userAgentId: "agent-2",
      agentId: "agent-2",
      key: "dm:other",
      kind: "dm",
      harness: "claude",
    },
    0,
  );
  const mine = await createSession(store);
  await store.inbox.intake([item(other), item(mine)], 0);
  const claimed = await store.turns.claim(1, { organizationId: "org-1" });
  expect(claimed.map((entry) => entry.session.id)).toEqual([mine.id]);
});
