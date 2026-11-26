import { sessionKeys } from "@substrate/contracts/agent-work";

import { agentRequests, agentStatus, agentWakes } from "../../schema";
import { agentWorkFixture } from "../../testing/agent-work";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";

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
    sessionKey: sessionKeys.dm(dm.id),
    dedupeKey: `msg:${crypto.randomUUID()}`,
  });
  const request = (agentActorEntityId: string) => ({
    organizationId: f.orgA,
    userAgentId: agent.agentId,
    ownerUserId: "alice",
    agentActorEntityId,
    sessionKey: sessionKeys.dm(dm.id),
    turnId: crypto.randomUUID(),
    kind: "question" as const,
    mode: "async" as const,
    payload: { type: "proposal" as const, summary: "x" },
  });
  // Another agent's actor, and the owner's own human actor.
  for (const actorId of [other.actorId, f.alice]) {
    expect(await rejection(f.db.insert(agentWakes).values(wake(actorId)).execute())).toMatchObject(
      foreignKey,
    );
    expect(
      await rejection(f.db.insert(agentRequests).values(request(actorId)).execute()),
    ).toMatchObject(foreignKey);
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
  expect(
    await rejection(
      f.db
        .insert(agentStatus)
        .values({ ...status, organizationId: f.orgB })
        .execute(),
    ),
  ).toMatchObject(foreignKey);

  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  const elsewhere = await alice.sendMessage(channel.id, "Root");
  expect(
    await rejection(
      f.db
        .insert(agentStatus)
        .values({ ...status, liveConversationId: dm.id, liveThreadId: elsewhere.id })
        .execute(),
    ),
  ).toMatchObject(foreignKey);
  expect(
    await rejection(
      f.db
        .insert(agentStatus)
        .values({ ...status, liveThreadId: elsewhere.id })
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23514" } });
  await f.db
    .insert(agentStatus)
    .values({ ...status, liveConversationId: channel.id, liveThreadId: elsewhere.id });
});
