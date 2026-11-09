import { agentRequests, agentStatus, agentWakes } from "../../schema";
import { agentWorkFixture } from "../../testing/agent-work";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { expect, test } from "bun:test";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */
const f = setupDatabase();

const foreignKey = { cause: { code: "23503" } };

test("wakes and requests name the user agent's own agent actor", async () => {
  const { agent, dm } = await agentWorkFixture(f);
  const other = await ownedAgent(f, "alice", "Other");
  const wake = (agentActorEntityId: string) => ({
    organizationId: f.orgA,
    userAgentId: agent.agentId,
    agentActorEntityId,
    ownerUserId: "alice",
    source: "owner_message" as const,
    sourceRef: { requestId: crypto.randomUUID() },
    sessionKey: `dm:${dm.id}`,
    dedupeKey: `msg:${crypto.randomUUID()}`,
  });
  const request = (agentActorEntityId: string) => ({
    organizationId: f.orgA,
    userAgentId: agent.agentId,
    ownerUserId: "alice",
    agentActorEntityId,
    sessionKey: `dm:${dm.id}`,
    turnId: crypto.randomUUID(),
    kind: "question" as const,
    mode: "async" as const,
    payload: { type: "proposal" as const, summary: "x" },
  });
  // Another agent's actor, and the owner's own human actor.
  for (const actorId of [other.actorId, f.alice]) {
    await expect(f.db.insert(agentWakes).values(wake(actorId)).execute()).rejects.toMatchObject(
      foreignKey,
    );
    await expect(
      f.db.insert(agentRequests).values(request(actorId)).execute(),
    ).rejects.toMatchObject(foreignKey);
  }
  await f.db.insert(agentWakes).values(wake(agent.actorId));
  await f.db.insert(agentRequests).values(request(agent.actorId));
});

test("status belongs to an organization where the agent has its actor, and its thread to its conversation", async () => {
  const { agent, alice, dm } = await agentWorkFixture(f);
  const status = {
    userAgentId: agent.agentId,
    organizationId: f.orgA,
    ownerUserId: "alice",
    state: "working" as const,
    version: 1,
  };
  await expect(
    f.db
      .insert(agentStatus)
      .values({ ...status, organizationId: f.orgB })
      .execute(),
  ).rejects.toMatchObject(foreignKey);

  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  const elsewhere = await alice.sendMessage(channel.id, "Root");
  await expect(
    f.db
      .insert(agentStatus)
      .values({ ...status, liveConversationId: dm.id, liveThreadId: elsewhere.id })
      .execute(),
  ).rejects.toMatchObject(foreignKey);
  await expect(
    f.db
      .insert(agentStatus)
      .values({ ...status, liveThreadId: elsewhere.id })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23514" } });
  await f.db
    .insert(agentStatus)
    .values({ ...status, liveConversationId: channel.id, liveThreadId: elsewhere.id });
});
