import { agentTurns, agentWorkItems } from "../../schema";
import { agentWorkFixture, ownerAgentWork } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { insertTurn, routineTurn, threadTurn } from "../../testing/turns";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function sharedThread() {
  const fixture = await agentWorkFixture(f);
  const shared = await fixture.bob.createConversation({
    kind: "channel",
    name: "secret-plans",
    private: true,
    emails: ["alice@example.com"],
  });
  const root = await fixture.bob.sendMessage(shared.id, "Secret root");
  return { ...fixture, shared, root };
}

test("status is derived from queued items, live turns and turns that need the owner", async () => {
  const { agent, alice, dm, owner } = await agentWorkFixture(f);
  const work = await ownerAgentWork(f.db, owner);
  expect((await work.listStatus())[0]).toMatchObject({ state: "idle", queuedCount: 0 });
  await alice.sendMessage(dm.id, "Summarize the week");
  expect((await work.listStatus())[0]).toMatchObject({
    state: "queued",
    queuedCount: 1,
    device: { id: agent.device.id },
  });
  const turn = await insertTurn(f.db, agent, routineTurn(null));
  await f.db.update(agentTurns).set({ activity: "Reading" }).where(eq(agentTurns.id, turn.id));
  expect((await work.listStatus())[0]).toMatchObject({ state: "working", activity: "Reading" });
  await f.db
    .update(agentTurns)
    .set({ status: "needs_attention", attentionReason: "unfinished_tool" })
    .where(eq(agentTurns.id, turn.id));
  expect((await work.listStatus())[0]).toMatchObject({ state: "needs_you", activity: null });
  const needsYou = await work.listNeedsYou();
  expect(needsYou.agents.map((status) => status.userAgentId)).toEqual([agent.agentId]);
  expect(needsYou.turns).toEqual([
    expect.objectContaining({ id: turn.id, attentionReason: "unfinished_tool", place: null }),
  ]);
});

test("after the owner leaves the live conversation, status and needs-you show no place or activity", async () => {
  const { agent, alice, owner, shared, root } = await sharedThread();
  const work = await ownerAgentWork(f.db, owner);
  const turn = await insertTurn(f.db, agent, threadTurn(shared.id, root.id));
  await f.db
    .update(agentTurns)
    .set({ activity: "Reading the secret launch notes" })
    .where(eq(agentTurns.id, turn.id));
  expect((await work.listStatus())[0]).toMatchObject({
    liveConversationId: shared.id,
    liveThreadId: root.id,
    activity: "Reading the secret launch notes",
  });
  // A steered item that may not have been read waits for the owner too.
  await f.db.insert(agentWorkItems).values({
    organizationId: f.orgA,
    userAgentId: agent.agentId,
    agentActorEntityId: agent.actorId,
    ownerUserId: "alice",
    sessionId: turn.sessionId,
    source: "owner_message",
    sourceRef: {
      source: "owner_message",
      messageId: root.id,
      conversationId: shared.id,
      threadId: root.id,
    },
    lane: "owner",
    dedupeKey: crypto.randomUUID(),
    availableAt: new Date(),
    deadlineAt: new Date(),
    status: "uncertain",
    steered: true,
    turnId: turn.id,
  });
  expect((await work.listNeedsYou()).items[0]?.place).toEqual({
    conversationId: shared.id,
    threadId: root.id,
  });

  await alice.leaveConversation(shared.id);
  const hidden = { liveConversationId: null, liveThreadId: null, activity: null };
  expect((await work.listStatus())[0]).toMatchObject(hidden);
  await f.db
    .update(agentTurns)
    .set({ status: "needs_attention", attentionReason: "uncertain_input" })
    .where(eq(agentTurns.id, turn.id));
  const needsYou = await work.listNeedsYou();
  expect(needsYou.agents[0]).toMatchObject(hidden);
  expect(needsYou.turns[0]?.place).toBeNull();
  expect(needsYou.items[0]?.place).toBeNull();
  const text = JSON.stringify([await work.listStatus(), needsYou]);
  for (const secret of ["secret", shared.id, root.id]) expect(text).not.toContain(secret);
});

test("a live turn without a place keeps its activity", async () => {
  const { agent, owner } = await agentWorkFixture(f);
  const work = await ownerAgentWork(f.db, owner);
  const turn = await insertTurn(f.db, agent, routineTurn(null));
  await f.db
    .update(agentTurns)
    .set({ activity: "Running the weekly routine" })
    .where(eq(agentTurns.id, turn.id));
  expect((await work.listStatus())[0]).toMatchObject({
    state: "working",
    liveConversationId: null,
    activity: "Running the weekly routine",
  });
});
