import { sessionKeys } from "@substrate/contracts/agent-work";

import { agentSessions, agentTurns } from "../../../schema";
import { hostWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { hostFixture } from "../../../testing/host";
import { steerTurn } from "./steer";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function liveDmTurn() {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "Start");
  const [claimed] = await x.claim();
  const host = await hostWork(f.db, x.agent.identity);
  await host.start(claimed!.turn.id, { attempt: 1, droppedItemIds: [] });
  const steer = (input: Partial<Parameters<typeof steerTurn>[3]> = {}) =>
    x.run((tx) =>
      steerTurn(
        tx,
        x.identity,
        claimed!.turn.id,
        { attempt: 1, harnessCanSteer: true, awaitingRequestIds: [], ...input },
        new Date(Date.now() + 5_000),
      ),
    );
  return { ...x, host, claimed: claimed!, steer };
}

test("an owner message joins the live interactive turn of its session as steered input", async () => {
  const x = await liveDmTurn();
  const next = await x.alice.sendMessage(x.dm.id, "Also this");
  const steered = await x.steer();
  expect(steered.waiting).toBe(false);
  expect(steered.items.map((item) => [item.sourceRef, item.steered, item.status])).toEqual([
    [
      { source: "owner_message", messageId: next.id, conversationId: x.dm.id, threadId: null },
      true,
      "submitted",
    ],
  ]);
  expect((await x.steer()).items).toEqual([]);
});

test("a steer that failed before delivery waits again; an unknown result never resends", async () => {
  const x = await liveDmTurn();
  await x.alice.sendMessage(x.dm.id, "One");
  const [first] = (await x.steer()).items;
  const undelivered = await x.host.steerResult(first!.id, {
    turnId: x.claimed.turn.id,
    result: "undelivered",
  });
  expect(undelivered.result).toEqual({ status: "pending" });
  expect(await x.itemRow(first!.id)).toMatchObject({ steered: false, turnId: null });
  const [again] = (await x.steer()).items;
  expect(again!.id).toBe(first!.id);
  expect(
    (await x.host.steerResult(again!.id, { turnId: x.claimed.turn.id, result: "uncertain" }))
      .result,
  ).toEqual({ status: "uncertain" });
  expect((await x.steer()).items).toEqual([]);
});

test("items wait, held, when the turn cannot take them; passive context that cannot join is dropped", async () => {
  const x = await liveDmTurn();
  const waiting = await x.alice.sendMessage(x.dm.id, "Wait for me");
  const held = await x.steer({ harnessCanSteer: false });
  expect(held).toEqual({ items: [], waiting: true });
  const [item] = (await x.items()).filter(
    (row) => row.sourceRef.source === "owner_message" && row.sourceRef.messageId === waiting.id,
  );
  expect(item).toMatchObject({ status: "pending", held: true });
  const routine = await x.session({
    key: sessionKeys.routine(crypto.randomUUID()),
    kind: "routine",
  });
  const passive = await x.item(routine, {
    source: "thread_context",
    messageIds: [crypto.randomUUID()],
    targetTurnId: crypto.randomUUID(),
    conversationId: x.dm.id,
    threadId: crypto.randomUUID(),
  });
  await x.steer();
  expect(await x.itemRow(passive.id)).toMatchObject({ status: "dropped", reason: "not_steerable" });
});

test("a stopping or handoff turn takes no steered input", async () => {
  const x = await liveDmTurn();
  await x.alice.sendMessage(x.dm.id, "Later");
  await f.db
    .update(agentTurns)
    .set({ status: "stopping" })
    .where(eq(agentTurns.id, x.claimed.turn.id));
  expect((await x.steer()).items).toEqual([]);
  await f.db
    .update(agentTurns)
    .set({ status: "running", handoff: true })
    .where(eq(agentTurns.id, x.claimed.turn.id));
  expect((await x.steer()).items).toEqual([]);
});

test("input waits for the fresh session when the owner reset it while the turn runs", async () => {
  const x = await liveDmTurn();
  await f.db
    .update(agentSessions)
    .set({ resetGeneration: 1, resetReason: "new_topic" })
    .where(eq(agentSessions.id, x.claimed.session.id));
  await x.alice.sendMessage(x.dm.id, "New topic");
  expect(await x.steer()).toEqual({ items: [], waiting: true });
  const held = (await x.items()).filter((item) => item.held);
  expect(held.map((item) => item.status)).toEqual(["pending"]);
});

test("an approval result that a held tool call waits on does not steer", async () => {
  const x = await liveDmTurn();
  const session = await x.session({ key: x.claimed.session.key, kind: "dm" });
  const requestId = crypto.randomUUID();
  await x.item(session, { source: "approval_result", requestId, anchorMessageId: null });
  expect((await x.steer({ awaitingRequestIds: [requestId] })).items).toEqual([]);
  expect((await x.steer()).items.map((item) => item.sourceRef)).toEqual([
    { source: "approval_result", requestId, anchorMessageId: null },
  ]);
});
