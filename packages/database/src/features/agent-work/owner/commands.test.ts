import type { TurnAttentionReason } from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import { agentSessions, agentTurns } from "../../../schema";
import { hostWork, ownerAgentWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { hostFixture } from "../../../testing/host";
import { rejection } from "../../../testing/rejection";
import { insertTurn } from "../../../testing/turns";
import { steerTurn } from "../host/steer";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function running() {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "Start");
  const [claimed] = await x.claim();
  const host = await hostWork(f.db, x.agent.identity);
  await host.start(claimed!.turn.id, { attempt: 1, droppedItemIds: [] });
  const owner = await ownerAgentWork(f.db, x.owner);
  const bob = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  const turnId = claimed!.turn.id;
  const attention = (reason: TurnAttentionReason = "unfinished_tool") =>
    f.db
      .update(agentTurns)
      .set({
        status: "needs_attention",
        attentionReason: reason,
        leaseDeviceId: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      })
      .where(eq(agentTurns.id, turnId));
  const uncertain = async () => {
    await x.alice.sendMessage(x.dm.id, "Also this");
    const steered = await x.run((tx) =>
      steerTurn(
        tx,
        x.identity,
        turnId,
        { attempt: 1, harnessCanSteer: true, awaitingRequestIds: [] },
        new Date(Date.now() + 5_000),
      ),
    );
    const item = steered.items[0]!;
    const finished = await host.finish(turnId, {
      attempt: 1,
      status: "completed",
      outcome: "replied",
      error: null,
      attentionReason: null,
      interruption: null,
      consumedItemIds: [],
      stillQueuedItemIds: [],
      usage: null,
    });
    expect(finished.result.status).toBe("needs_attention");
    return item.id;
  };
  return { ...x, claimed: claimed!, host, owner, bob, turnId, attention, uncertain };
}

test("the owner stops a live turn; another person cannot, and an ended turn is a conflict", async () => {
  const x = await running();
  expect(await rejection(x.bob.stopTurn(x.turnId))).toBeInstanceOf(AccessDeniedError);
  const stopped = await x.owner.stopTurn(x.turnId);
  expect(stopped.result.turn).toMatchObject({ status: "stopping", interruption: "stop" });
  expect(stopped.hints).toContainEqual({
    audience: realtimeKeys.user("alice"),
    domain: "agent-work",
  });
  expect((await x.host.progress(x.turnId, { attempt: 1, consumedItemIds: [] })).result.status).toBe(
    "stopping",
  );
  await f.db
    .update(agentTurns)
    .set({ status: "cancelled", leaseDeviceId: null, leaseExpiresAt: null })
    .where(eq(agentTurns.id, x.turnId));
  expect(await rejection(x.owner.stopTurn(x.turnId))).toBeInstanceOf(ConflictError);
});

test("retry runs the turn again as its next attempt, leased to the home desktop", async () => {
  const x = await running();
  expect(await rejection(x.owner.retryTurn(x.turnId))).toBeInstanceOf(ConflictError);
  await x.attention();
  const { result } = await x.owner.retryTurn(x.turnId);
  expect(result.turn).toMatchObject({
    status: "assigned",
    attempt: 2,
    generation: 2,
    attentionReason: null,
  });
  expect(await x.turnRow(x.turnId)).toMatchObject({ leaseDeviceId: x.agent.device.id });
  const synced = await x.host.sync();
  expect(synced.map((turn) => [turn.turn.id, turn.turn.attempt])).toEqual([[x.turnId, 2]]);
});

test("retry waits while another turn holds the agent's slot", async () => {
  const x = await running();
  await x.attention();
  const other = await insertTurn(f.db, x.agent, {
    key: x.claimed.session.key,
    kind: "interactive",
    origin: x.claimed.session.origin,
  });
  await f.db
    .update(agentTurns)
    .set({ folderKey: x.claimed.turn.folderKey })
    .where(eq(agentTurns.id, other.id));
  expect(await rejection(x.owner.retryTurn(x.turnId))).toBeInstanceOf(ConflictError);
  expect(await rejection(x.owner.startFresh(x.turnId))).toBeInstanceOf(ConflictError);
  expect((await x.turnRow(x.turnId)).status).toBe("needs_attention");
});

test("retry of a turn that waits only for uncertain input sends that input again", async () => {
  const x = await running();
  const itemId = await x.uncertain();
  const { result } = await x.owner.retryTurn(x.turnId);
  expect(result.turn).toMatchObject({ status: "completed", attempt: 1 });
  expect(await x.itemRow(itemId)).toMatchObject({
    status: "pending",
    turnId: null,
    steered: false,
  });
});

test("dismiss ends the turn and drops its batch", async () => {
  const x = await running();
  await x.attention();
  const { result } = await x.owner.dismissTurn(x.turnId);
  expect(result.turn.status).toBe("cancelled");
  const [batch] = x.claimed.items;
  expect(await x.itemRow(batch!.id)).toMatchObject({ status: "dropped", reason: "dismissed" });
});

test("start fresh resets the session and runs the turn again in the new generation", async () => {
  const x = await running();
  await x.attention();
  await x.owner.startFresh(x.turnId);
  const [session] = await f.db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, x.claimed.session.id));
  expect(session).toMatchObject({ resetGeneration: 1, resetReason: "start_fresh" });
  expect(await x.turnRow(x.turnId)).toMatchObject({
    status: "assigned",
    attempt: 2,
    resetGeneration: 1,
  });
  const [synced] = await x.host.sync();
  expect(synced!.session).toMatchObject({ resetGeneration: 1, resetReason: "start_fresh" });
});

test("send now makes a held item available and interrupts the turn in its slot", async () => {
  const x = await running();
  await x.alice.sendMessage(x.dm.id, "Urgent");
  await x.run((tx) =>
    steerTurn(
      tx,
      x.identity,
      x.turnId,
      { attempt: 1, harnessCanSteer: false, awaitingRequestIds: [] },
      new Date(Date.now() + 5_000),
    ),
  );
  const held = (await x.items()).find((item) => item.held)!;
  const { result } = await x.owner.sendNow(held.id);
  expect(result.interruptedTurnId).toBe(x.turnId);
  expect(result.item).toMatchObject({ held: false, status: "pending" });
  expect(Date.parse(result.item.availableAt)).toBeLessThanOrEqual(Date.now());
  expect(await x.turnRow(x.turnId)).toMatchObject({ status: "stopping", interruption: "owner" });
  expect(await rejection(x.bob.sendNow(held.id))).toBeInstanceOf(AccessDeniedError);
});

test("resend and discard settle uncertain items; the turn settles when none is left", async () => {
  const x = await running();
  const itemId = await x.uncertain();
  const [batch] = x.claimed.items;
  expect(await rejection(x.owner.resendItem(batch!.id))).toBeInstanceOf(ConflictError);
  const { result } = await x.owner.discardItem(itemId);
  expect(result.item).toMatchObject({ status: "dropped", reason: "discarded" });
  expect((await x.turnRow(x.turnId)).status).toBe("completed");
  expect(await rejection(x.owner.resendItem(itemId))).toBeInstanceOf(ConflictError);
});

test("resend queues the uncertain item again and settles its turn", async () => {
  const x = await running();
  const itemId = await x.uncertain();
  const { result } = await x.owner.resendItem(itemId);
  expect(result.item).toMatchObject({ status: "pending", turnId: null, steered: false });
  expect((await x.turnRow(x.turnId)).status).toBe("completed");
});

test("a new topic resets the agent's DM sessions in the conversation", async () => {
  const x = await running();
  const { result } = await x.owner.newTopic(x.dm.id);
  expect(result.sessionIds).toEqual([x.claimed.session.id]);
  const [session] = await f.db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, x.claimed.session.id));
  expect(session).toMatchObject({ resetGeneration: 1, resetReason: "new_topic" });
  const channel = await x.alice.createConversation({ kind: "channel", name: "general" });
  expect(await rejection(x.owner.newTopic(channel.id))).toBeInstanceOf(ValidationError);
  expect(await rejection(x.bob.newTopic(x.dm.id))).toBeInstanceOf(AccessDeniedError);
});
