import { inboxLaneAgingMs, sessionKeys } from "@substrate/contracts/agent-work";

import { background, createSession, item, openTestStore, system } from "../test-support.ts";
import { agentTurnsPage } from "./repository.ts";
import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import { rejects } from "node:assert/strict";

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

  const first = await store.turns.claim(1, { organizationId: "org-1" });
  expect(first).toHaveLength(1);
  expect(await store.turns.claim(2, { organizationId: "org-1" })).toEqual([]);

  await store.turns.finish(first[0]!.turn.id, { status: "completed" }, 3);
  const second = await store.turns.claim(4, { organizationId: "org-1" });
  expect(second.map((claimed) => claimed.session.id)).toEqual([
    first[0]!.session.id === dm.id ? thread.id : dm.id,
  ]);
});

test("an agent's turns page newest first without skipping turns that share a start time", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  const created: string[] = [];
  for (let i = 0; i < 4; i++) {
    await store.inbox.intake([item(session)], 0);
    const [claimed] = await store.turns.claim(5, { organizationId: "org-1" });
    await store.turns.finish(claimed!.turn.id, { status: "completed" }, 5);
    created.push(claimed!.turn.id);
  }
  await createSession(store, { userAgentId: "other" }).then((other) =>
    store.inbox.intake([item(other)], 0),
  );
  await store.turns.claim(5, { organizationId: "org-1" });

  const first = await store.turns.forAgent("org-1", "agent-1", { limit: 3 });
  expect(first.rows).toHaveLength(3);
  const last = first.rows.at(-1)!;
  const second = await store.turns.forAgent("org-1", "agent-1", {
    limit: 3,
    before: { createdAt: last.createdAt, id: last.id },
  });
  expect(second.more).toBe(false);
  const paged = [...first.rows, ...second.rows].map((turn) => turn.id);
  expect(first.more).toBe(true);
  expect(paged.toSorted()).toEqual(created.toSorted());
  expect(paged).toEqual(created.toReversed());
});

test("a deep activity page seeks the agent index from its cursor", () => {
  const query = agentTurnsPage(
    drizzle(async () => ({ rows: [] })),
    "org-1",
    "agent-1",
    {
      before: { createdAt: 5, id: "turn" },
      limit: 30,
    },
  ).toSQL();
  const sqlite = new Database(fixture.path, { readonly: true });
  try {
    // SAFETY: these are the statement's own bound values.
    const params = query.params as never[];
    const plan = sqlite
      .query<{ detail: string }, never[]>(`explain query plan ${query.sql}`)
      .all(...params);
    // The seek starts at the cursor; a scan of the agent's range would grow with each page.
    expect(plan.map((step) => step.detail)).toContain(
      "SEARCH turns USING INDEX turns_agent_page (organization_id=? AND user_agent_id=? AND (created_at,id)<(?,?))",
    );
  } finally {
    sqlite.close();
  }
});

test("the device runs at most three live turns", async () => {
  const { store } = fixture;
  for (const agent of ["a", "b", "c", "d"]) {
    const session = await createSession(store, { userAgentId: agent });
    await store.inbox.intake([item(session)], 0);
  }
  expect(await store.turns.claim(1, { organizationId: "org-1" })).toHaveLength(3);
  expect(await store.turns.claim(2, { organizationId: "org-1" })).toEqual([]);
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
      system(sessions[1]!, "system"),
      item(sessions[2]!),
      background(sessions[3]!),
    ],
    0,
  );
  const claimed = await store.turns.claim(1, { organizationId: "org-1", deviceCap: 2 });
  expect(claimed.map((entry) => entry.session.userAgentId)).toEqual(["c", "b"]);
});

test("background work moves up one lane for every ten minutes it waits", async () => {
  const { store } = fixture;
  const waiting = await createSession(store, { userAgentId: "waiting" });
  const fresh = await createSession(store, { userAgentId: "fresh" });
  await store.inbox.intake([background(waiting)], 0);
  const now = 2 * inboxLaneAgingMs;
  await store.inbox.intake([system(fresh, "system")], now);
  const claimed = await store.turns.claim(now, { organizationId: "org-1", deviceCap: 1 });
  expect(claimed.map((entry) => entry.session.userAgentId)).toEqual(["waiting"]);
});

test("main slots go before helper slots in the same lane", async () => {
  const { store } = fixture;
  const helper = await createSession(store, { userAgentId: "a", kind: "helper" });
  const main = await createSession(store, { userAgentId: "b" });
  await store.inbox.intake([system(helper, "h")], 0);
  await store.inbox.intake([system(main, "m")], 5);
  const claimed = await store.turns.claim(10, { organizationId: "org-1", deviceCap: 1 });
  expect(claimed.map((entry) => entry.session.id)).toEqual([main.id]);
});

test("a claim batches the session's available items and marks owner work interactive", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([background(session), item(session), item(session)], 0);
  await store.inbox.intake([item(session, { availableAt: 100 })], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1", batchLimit: 20 });
  expect(claimed!.items).toHaveLength(3);
  expect(claimed!.turn.kind).toBe("interactive");
  expect((await store.inbox.forTurn("org-1", claimed!.turn.id)).map((row) => row.status)).toEqual([
    "submitted",
    "submitted",
    "submitted",
  ]);
});

test("helper turns are unattended even with owner-lane items", async () => {
  const { store } = fixture;
  const helper = await createSession(store, { kind: "helper" });
  await store.inbox.intake([item(helper)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
  expect(claimed!.turn.kind).toBe("unattended");
});

test("a usage event records the turn's latest usage with the event", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
  const turnId = claimed!.turn.id;
  const usage = { inputTokens: 10, outputTokens: 2, contextUsed: 40, contextWindow: 100 };
  await store.events.append(turnId, [{ kind: "usage", data: { usage } }], 2);
  expect((await store.turns.get(turnId))?.usage).toEqual(usage);
});

test("events of a turn are numbered without gaps across appends", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
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
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
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
  await store.inbox.consumed(turnId, consumed, 3);
  await store.turns.finish(turnId, { status: "interrupted", stillQueuedInputIds: [queued] }, 3);
  const status = async (id: string) => (await store.inbox.get("org-1", id))!.status;
  expect(await status(batch[0]!.id)).toBe("consumed");
  expect(await status(consumed)).toBe("consumed");
  expect(await status(queued)).toBe("confirmed_unconsumed");
  expect(await status(unknown)).toBe("uncertain");

  // The uncertain item is never resent by itself: the session waits for the owner.
  await store.inbox.intake([item(session, { availableAt: 0 })], 0);
  expect(await store.turns.claim(10, { organizationId: "org-1" })).toEqual([]);
  expect(await status(unknown)).toBe("uncertain");

  // Once the owner decides, the requeued item goes before older pending items of its lane.
  await store.inbox.discard(unknown, 11);
  const [next] = await store.turns.claim(12, { organizationId: "org-1", batchLimit: 1 });
  expect(next!.items.map((row) => row.id)).toEqual([queued]);
});

test("recovery continues a turn once when every tool finished and no input is unconfirmed", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
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
  expect(await store.turns.recover(4, "org-1")).toEqual([{ turnId, action: "continue" }]);
  const continued = (await store.turns.get(turnId))!;
  expect(continued).toMatchObject({ status: "assigned", attempt: 2, generation: 2 });

  await store.turns.running(turnId, 5);
  expect(await store.turns.recover(6, "org-1")).toEqual([
    { turnId, action: "needs_attention", reason: "interrupted_again" },
  ]);
  expect((await store.turns.get(turnId))!.status).toBe("needs_attention");
});

test("recovery asks the owner when a tool call did not finish", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
  const turnId = claimed!.turn.id;
  await store.turns.running(turnId, 2);
  await store.events.append(
    turnId,
    [{ kind: "tool_started", itemId: "t1", data: { itemType: "mcp", title: "create_task" } }],
    3,
  );
  expect(await store.turns.recover(4, "org-1")).toEqual([
    { turnId, action: "needs_attention", reason: "unfinished_tool" },
  ]);
});

test("recovery asks the owner when steered input was not confirmed, and marks it uncertain", async () => {
  const { store } = fixture;
  const { turnId, steered } = await steeredTurn();
  await store.turns.running(turnId, 2);
  expect(await store.turns.recover(4, "org-1")).toEqual([
    { turnId, action: "needs_attention", reason: "uncertain_input" },
  ]);
  expect((await store.inbox.get("org-1", steered[0]!))!.status).toBe("uncertain");
});

test("recovery puts the items of a turn that never started back in the inbox", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
  expect(await store.turns.recover(2, "org-1")).toEqual([
    { turnId: claimed!.turn.id, action: "requeued" },
  ]);
  const [again] = await store.turns.claim(3, { organizationId: "org-1" });
  expect(again!.items.map((row) => row.id)).toEqual(claimed!.items.map((row) => row.id));
});

test("dismissing a needs-attention turn drops its items", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
  await store.turns.attention(claimed!.turn.id, "failed", "Harness failed.", 2);
  expect((await store.inbox.get("org-1", claimed!.items[0]!.id))!.status).toBe("submitted");
  await store.turns.dismiss(claimed!.turn.id, 3);
  expect((await store.turns.get(claimed!.turn.id))!.status).toBe("cancelled");
  expect((await store.inbox.get("org-1", claimed!.items[0]!.id))!.status).toBe("dropped");
});

test("a claim takes only the active organization's work", async () => {
  const { store } = fixture;
  const other = await store.sessions.ensure(
    {
      organizationId: "org-2",
      userAgentId: "agent-2",
      agentId: "agent-2",
      key: sessionKeys.dm("other"),
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

test("a turn's status change and its events land in one transaction", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  const [input] = await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
  const turnId = claimed!.turn.id;

  await store.turns.running(turnId, 2, [{ kind: "turn_started", data: {} }]);
  await store.inbox.consumed(turnId, input!.id, 3, [
    { kind: "input_consumed", data: { inputId: input!.id } },
  ]);
  await store.turns.waiting(turnId, 4, [
    { kind: "request", data: { requestId: "request-1", kind: "question" } },
  ]);
  expect((await store.turns.get(turnId))!.status).toBe("waiting");
  expect((await store.inbox.get("org-1", input!.id))!.status).toBe("consumed");
  expect((await store.events.list(turnId)).map((event) => [event.seq, event.kind])).toEqual([
    [1, "turn_started"],
    [2, "input_consumed"],
    [3, "request"],
  ]);
});

test("an output whose event cannot be appended is not recorded", async () => {
  const { store } = fixture;
  const output = { kind: "task", id: "task-1" } as const;
  const event = {
    kind: "output",
    data: { kind: "task", id: "task-1", createdAt: "2026-01-01T00:00:00.000Z" },
  } as const;
  await rejects(store.outputs.record("no-such-turn", output, 1, [event]), {
    message: "Turn not found.",
  });
  expect(await store.outputs.forTurn("no-such-turn")).toEqual([]);

  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
  await store.outputs.record(claimed!.turn.id, output, 2, [event]);
  expect((await store.outputs.forTurn(claimed!.turn.id)).map((row) => row.targetId)).toEqual([
    "task-1",
  ]);
  expect((await store.events.list(claimed!.turn.id)).map((row) => row.kind)).toEqual(["output"]);
});

test("events are read by kind, oldest first", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
  const turnId = claimed!.turn.id;
  await store.events.append(
    turnId,
    [
      { kind: "text", data: { text: "a" } },
      { kind: "request", data: { requestId: "request-1", kind: "question" } },
      { kind: "note", data: { text: "b" } },
      { kind: "request_resolved", data: { requestId: "request-1" } },
    ],
    2,
  );
  const events = await store.events.ofKinds(turnId, ["request", "request_resolved"]);
  expect(events.map((event) => [event.seq, event.kind])).toEqual([
    [2, "request"],
    [4, "request_resolved"],
  ]);
});
