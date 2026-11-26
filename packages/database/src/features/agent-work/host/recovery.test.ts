import { agentTurns, agentWorkItems } from "../../../schema";
import { hostWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { hostFixture } from "../../../testing/host";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function claimed(start = true) {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "Work");
  const [turn] = await x.claim();
  const host = await hostWork(f.db, x.agent.identity);
  if (start) await host.start(turn!.turn.id, { attempt: 1, droppedItemIds: [] });
  const recover = (attempt: number, unfinishedTool = false) =>
    host.recover(turn!.turn.id, { attempt, unfinishedTool }).then((result) => result.result);
  return { ...x, host, turn: turn!, recover };
}

test("a turn that never started puts its batch back", async () => {
  const x = await claimed(false);
  expect(await x.recover(1)).toEqual({ action: "requeued" });
  expect((await x.turnRow(x.turn.turn.id)).status).toBe("cancelled");
  expect((await x.items()).map((item) => item.status)).toEqual(["pending"]);
});

test("a started turn continues once as its next attempt, then needs the owner", async () => {
  const x = await claimed();
  expect(await x.recover(1)).toEqual({ action: "continue" });
  expect(await x.turnRow(x.turn.turn.id)).toMatchObject({
    status: "assigned",
    attempt: 2,
    generation: 2,
    recoveries: 1,
    interruption: "app",
  });
  // The old attempt no longer reports anything.
  expect(await x.recover(1).catch((error: Error) => error.name)).toBe("ConflictError");
  await x.host.start(x.turn.turn.id, { attempt: 2, droppedItemIds: [] });
  expect(await x.recover(2)).toEqual({ action: "needs_attention", reason: "interrupted_again" });
  // The batch stays with the turn for Retry or Dismiss.
  expect((await x.items()).map((item) => item.status)).toEqual(["submitted"]);
});

test("an unfinished tool call or unconfirmed steered input needs the owner", async () => {
  const x = await claimed();
  expect(await x.recover(1, true)).toEqual({
    action: "needs_attention",
    reason: "unfinished_tool",
  });

  const y = await claimed();
  const session = await y.session({ key: y.turn.session.key, kind: "dm" });
  const steered = await y.item(session, {
    source: "owner_message",
    messageId: crypto.randomUUID(),
    conversationId: y.dm.id,
    threadId: null,
  });
  await f.db
    .update(agentWorkItems)
    .set({ status: "submitted", steered: true, turnId: y.turn.turn.id })
    .where(eq(agentWorkItems.id, steered.id));
  expect(await y.recover(1)).toEqual({ action: "needs_attention", reason: "uncertain_input" });
  expect(await y.itemRow(steered.id)).toMatchObject({ status: "uncertain", reason: "interrupted" });
});

test("a stopped turn is cancelled, and a turn the owner interrupted resumes in the next turn", async () => {
  const x = await claimed();
  await f.db
    .update(agentTurns)
    .set({ status: "stopping", interruption: "stop" })
    .where(eq(agentTurns.id, x.turn.turn.id));
  expect(await x.recover(1)).toEqual({ action: "cancelled" });

  const y = await claimed();
  await f.db
    .update(agentTurns)
    .set({ status: "stopping", interruption: "owner" })
    .where(eq(agentTurns.id, y.turn.turn.id));
  expect(await y.recover(1)).toEqual({ action: "interrupted" });
  const [recovery] = await f.db
    .select()
    .from(agentWorkItems)
    .where(eq(agentWorkItems.source, "recovery"));
  expect(recovery?.sourceRef).toEqual({ source: "recovery", turnId: y.turn.turn.id });
});

test("a handoff turn ends without a resume note", async () => {
  const x = await claimed();
  await f.db.update(agentTurns).set({ handoff: true }).where(eq(agentTurns.id, x.turn.turn.id));
  expect(await x.recover(1)).toEqual({ action: "interrupted" });
  expect(
    await f.db.select().from(agentWorkItems).where(eq(agentWorkItems.source, "recovery")),
  ).toEqual([]);
});
