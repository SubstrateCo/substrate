import { sessionKeys } from "@substrate/contracts/agent-work";

import { createSession, item, openTestStore } from "./test-support.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";

let fixture: Awaited<ReturnType<typeof openTestStore>>;
beforeEach(async () => {
  fixture = await openTestStore();
});
afterEach(() => fixture.cleanup());

async function liveTurn() {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
  await store.turns.running(claimed!.turn.id, 2);
  return { session, turnId: claimed!.turn.id, batch: claimed!.items };
}

test("a steer is recorded only while its turn is live, and a failed steer puts the item back", async () => {
  const { store } = fixture;
  const { session, turnId } = await liveTurn();
  const [message] = await store.inbox.intake([item(session)], 3);
  expect(await store.inbox.submitSteer(message!.id, turnId)).toBe(true);
  expect(await store.inbox.get("org-1", message!.id)).toMatchObject({
    status: "submitted",
    steered: true,
    turnId,
  });
  await store.inbox.revertSteer(message!.id, turnId, 3);
  expect(await store.inbox.get("org-1", message!.id)).toMatchObject({
    status: "pending",
    steered: false,
    turnId: null,
  });

  await store.turns.finish(turnId, { status: "completed" }, 4);
  expect(await store.inbox.submitSteer(message!.id, turnId)).toBe(false);
  expect((await store.inbox.get("org-1", message!.id))!.status).toBe("pending");
});

test("a stopping turn does not take steered input", async () => {
  const { store } = fixture;
  const { session, turnId } = await liveTurn();
  const [message] = await store.inbox.intake([item(session)], 3);
  await store.turns.stopping(turnId, "stop");
  expect(await store.inbox.submitSteer(message!.id, turnId)).toBe(false);
});

test("consumption evidence that arrives after the turn settled still marks the item consumed", async () => {
  const { store } = fixture;
  const { session, turnId } = await liveTurn();
  const [message] = await store.inbox.intake([item(session)], 3);
  await store.inbox.submitSteer(message!.id, turnId);
  await store.turns.finish(turnId, { status: "completed" }, 4);
  expect((await store.inbox.get("org-1", message!.id))!.status).toBe("uncertain");
  await store.inbox.consumed(turnId, message!.id, 3);
  expect((await store.inbox.get("org-1", message!.id))!.status).toBe("consumed");
});

test("a turn that ends with uncertain input needs the owner until each item is resent or discarded", async () => {
  const { store } = fixture;
  const { session, turnId, batch } = await liveTurn();
  const steered = await store.inbox.intake([item(session), item(session)], 3);
  for (const row of steered) await store.inbox.submitSteer(row.id, turnId);
  await store.turns.finish(turnId, { status: "completed", outcome: "replied" }, 4);
  expect(await store.turns.get(turnId)).toMatchObject({
    status: "needs_attention",
    attentionReason: "uncertain_input",
    outcome: "replied",
  });
  expect((await store.inbox.get("org-1", batch[0]!.id))!.status).toBe("consumed");

  // SAFETY: two items were steered above.
  const [resent, discarded] = steered as [(typeof steered)[0], (typeof steered)[0]];
  await store.inbox.resend(resent.id, 5);
  expect(await store.inbox.get("org-1", resent.id)).toMatchObject({
    status: "pending",
    steered: false,
    turnId: null,
    availableAt: 5,
  });
  expect((await store.turns.get(turnId))!.status).toBe("needs_attention");
  await store.inbox.discard(discarded.id, 6);
  expect((await store.inbox.get("org-1", discarded.id))!.status).toBe("dropped");
  expect((await store.turns.get(turnId))!.status).toBe("completed");

  const [next] = await store.turns.claim(7, { organizationId: "org-1" });
  expect(next!.items.map((row) => row.id)).toEqual([resent.id]);
});

test("retrying an uncertain-input turn resends its uncertain items instead of running the batch again", async () => {
  const { store } = fixture;
  const { session, turnId } = await liveTurn();
  const [message] = await store.inbox.intake([item(session)], 3);
  await store.inbox.submitSteer(message!.id, turnId);
  await store.turns.finish(turnId, { status: "completed" }, 4);
  await store.turns.retry(turnId, 5);
  expect((await store.turns.get(turnId))!.status).toBe("completed");
  expect((await store.inbox.get("org-1", message!.id))!.status).toBe("pending");
});

test("later items of a session wait while its turn needs the owner; other sessions run", async () => {
  const { store } = fixture;
  const blocked = await createSession(store);
  const other = await createSession(store, { kind: "thread" });
  await store.inbox.intake([item(blocked)], 0);
  const [first] = await store.turns.claim(1, { organizationId: "org-1" });
  await store.turns.attention(first!.turn.id, "failed", "Harness failed.", 2);
  await store.inbox.intake([item(blocked), item(other)], 3);
  const claimed = await store.turns.claim(4, { organizationId: "org-1" });
  expect(claimed.map((entry) => entry.session.id)).toEqual([other.id]);
});

test("after a restart a stopped turn is cancelled and a Send now turn is interrupted; neither continues", async () => {
  const { store } = fixture;
  const stopped = await liveTurn();
  await store.turns.stopping(stopped.turnId, "stop");
  const owner = await createSession(store, { userAgentId: "agent-2" });
  await store.inbox.intake([item(owner)], 0);
  const [sent] = await store.turns.claim(5, { organizationId: "org-1" });
  await store.turns.running(sent!.turn.id, 6);
  await store.turns.stopping(sent!.turn.id, "owner");

  const decisions = await store.turns.recover(7, "org-1");
  expect(decisions).toEqual(
    expect.arrayContaining([
      { turnId: stopped.turnId, action: "cancelled" },
      { turnId: sent!.turn.id, action: "interrupted" },
    ]),
  );
  expect((await store.turns.get(stopped.turnId))!.status).toBe("cancelled");
  expect((await store.turns.get(sent!.turn.id))!.status).toBe("interrupted");
  // The interrupted turn's work resumes in a new turn of its session.
  const [resume] = await store.turns.claim(8, { organizationId: "org-1" });
  expect(resume!.turn.resumesTurnId).toBe(sent!.turn.id);
});

test("a handoff turn rotates the epoch exactly once, also when it needs the owner and is retried", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.sessions.opened(
    session.id,
    { nativeSessionId: "n1", prefix: "p", policyVersion: 1 },
    0,
  );
  await store.epochs.requestRotation(session.id, "new_topic", "Hand off.", 0);
  const [handoff] = await store.turns.claim(1, { organizationId: "org-1" });
  expect(handoff!.turn.handoff).toBe(true);
  await store.turns.attention(handoff!.turn.id, "failed", "Harness failed.", 2);
  expect(await store.sessions.get(session.id)).toMatchObject({ epoch: 1, rotation: null });
  await store.turns.retry(handoff!.turn.id, 3);
  await store.turns.finish(handoff!.turn.id, { status: "completed" }, 4);
  expect((await store.sessions.get(session.id))!.epoch).toBe(1);
});

test("the device cap counts the live turns of the active organization only", async () => {
  const { store } = fixture;
  for (const agent of ["x", "y", "z"]) {
    const session = await store.sessions.ensure(
      {
        organizationId: "org-2",
        userAgentId: agent,
        agentId: agent,
        key: sessionKeys.dm(agent),
        kind: "dm",
        harness: "claude",
      },
      0,
    );
    await store.inbox.intake([item(session)], 0);
  }
  expect(await store.turns.claim(1, { organizationId: "org-2" })).toHaveLength(3);
  const mine = await createSession(store);
  await store.inbox.intake([item(mine)], 2);
  expect(await store.turns.claim(3, { organizationId: "org-1" })).toHaveLength(1);
});

test("a claim skips folders the runtime holds and agents that are not homed here", async () => {
  const { store } = fixture;
  const held = await createSession(store, { userAgentId: "held" });
  const away = await createSession(store, { userAgentId: "away" });
  const home = await createSession(store, { userAgentId: "home" });
  await store.inbox.intake([item(held), item(away), item(home)], 0);
  const claimed = await store.turns.claim(1, {
    organizationId: "org-1",
    busyFolders: ["main:held"],
    userAgentIds: ["held", "home"],
  });
  expect(claimed.map((entry) => entry.session.id)).toEqual([home.id]);
});

test("an unstarted turn puts its items back with a later available time", async () => {
  const { store } = fixture;
  const session = await createSession(store);
  await store.inbox.intake([item(session)], 0);
  const [claimed] = await store.turns.claim(1, { organizationId: "org-1" });
  expect(await store.turns.requeue(claimed!.turn.id, 5000, 2)).toBe("requeued");
  expect(await store.turns.get(claimed!.turn.id)).toBeUndefined();
  expect(await store.turns.claim(4999, { organizationId: "org-1" })).toEqual([]);
  const [again] = await store.turns.claim(5000, { organizationId: "org-1" });
  expect(again!.items.map((row) => row.id)).toEqual(claimed!.items.map((row) => row.id));
});

test("one turn interrupted under the runtime follows the recovery rules", async () => {
  const { store } = fixture;
  const { turnId } = await liveTurn();
  expect(await store.turns.recoverOne(turnId, 3)).toEqual({ turnId, action: "continue" });
  expect(await store.turns.get(turnId)).toMatchObject({ status: "assigned", attempt: 2 });
});
