import { sessionKeys } from "@substrate/contracts/agent-work";

import { registerDevice } from "../../core/devices/repository";
import { agentRequests, agentSessions, agentTurns, agentWorkItems } from "../../schema";
import { agentWorkFixture } from "../../testing/agent-work";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";

const f = setupDatabase();

const foreignKey = { cause: { code: "23503" } };

test("sessions and requests name the user agent's own agent actor", async () => {
  const { agent, dm } = await agentWorkFixture(f);
  const other = await ownedAgent(f, "alice", "Other");
  const session = (agentActorEntityId: string) => ({
    organizationId: f.orgA,
    userAgentId: agent.agentId,
    agentActorEntityId,
    ownerUserId: "alice",
    key: sessionKeys.dm(dm.id),
    kind: "dm" as const,
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
  for (const actorId of [other.actorId, f.alice]) {
    expect(
      await rejection(f.db.insert(agentSessions).values(session(actorId)).execute()),
    ).toMatchObject(foreignKey);
    expect(
      await rejection(f.db.insert(agentRequests).values(request(actorId)).execute()),
    ).toMatchObject(foreignKey);
  }
  expect(
    await rejection(
      f.db
        .insert(agentSessions)
        .values({ ...session(agent.actorId), ownerUserId: "bob" })
        .execute(),
    ),
  ).toMatchObject(foreignKey);
  await f.db.insert(agentSessions).values(session(agent.actorId));
  await f.db.insert(agentRequests).values(request(agent.actorId));
});

test("items and turns stay in their session's agent, and only the owner's device holds a lease", async () => {
  const { agent, alice, dm } = await agentWorkFixture(f);
  const other = await ownedAgent(f, "alice", "Other");
  const [session] = await f.db
    .insert(agentSessions)
    .values({
      organizationId: f.orgA,
      userAgentId: agent.agentId,
      agentActorEntityId: agent.actorId,
      ownerUserId: "alice",
      key: sessionKeys.dm(dm.id),
      kind: "dm",
      originConversationId: dm.id,
    })
    .returning();
  const otherAgent = {
    organizationId: f.orgA,
    userAgentId: other.agentId,
    agentActorEntityId: other.actorId,
    ownerUserId: "alice",
    sessionId: session!.id,
  };
  const now = new Date();
  const item = {
    source: "owner_message" as const,
    sourceRef: {
      source: "owner_message" as const,
      messageId: crypto.randomUUID(),
      conversationId: dm.id,
      threadId: null,
    },
    lane: "owner" as const,
    dedupeKey: crypto.randomUUID(),
    availableAt: now,
    deadlineAt: now,
  };
  expect(
    await rejection(
      f.db
        .insert(agentWorkItems)
        .values({ ...otherAgent, ...item })
        .execute(),
    ),
  ).toMatchObject(foreignKey);
  const turn = { folderKey: "main:x", kind: "interactive" as const };
  expect(
    await rejection(
      f.db
        .insert(agentTurns)
        .values({ ...otherAgent, ...turn })
        .execute(),
    ),
  ).toMatchObject(foreignKey);
  const own = { ...otherAgent, userAgentId: agent.agentId, agentActorEntityId: agent.actorId };
  const bobDevice = await registerDevice(f.db, "bob", {
    installationId: crypto.randomUUID(),
    name: "Bob's laptop",
    platform: "win32",
  });
  expect(
    await rejection(
      f.db
        .insert(agentTurns)
        .values({ ...own, ...turn, leaseDeviceId: bobDevice.id, leaseExpiresAt: now })
        .execute(),
    ),
  ).toMatchObject(foreignKey);
  await f.db
    .insert(agentTurns)
    .values({ ...own, ...turn, leaseDeviceId: agent.device.id, leaseExpiresAt: now });
  await f.db.insert(agentWorkItems).values({ ...own, ...item });

  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  const elsewhere = await alice.sendMessage(channel.id, "Root");
  expect(
    await rejection(
      f.db
        .insert(agentSessions)
        .values({
          ...own,
          key: sessionKeys.thread(elsewhere.id),
          kind: "thread",
          originConversationId: dm.id,
          originThreadId: elsewhere.id,
        })
        .execute(),
    ),
  ).toMatchObject(foreignKey);
});

test("one live turn per folder", async () => {
  const { agent, dm } = await agentWorkFixture(f);
  const [session] = await f.db
    .insert(agentSessions)
    .values({
      organizationId: f.orgA,
      userAgentId: agent.agentId,
      agentActorEntityId: agent.actorId,
      ownerUserId: "alice",
      key: sessionKeys.dm(dm.id),
      kind: "dm",
    })
    .returning();
  const turn = {
    organizationId: f.orgA,
    userAgentId: agent.agentId,
    agentActorEntityId: agent.actorId,
    ownerUserId: "alice",
    sessionId: session!.id,
    folderKey: `main:${agent.agentId}`,
    kind: "interactive" as const,
  };
  await f.db.insert(agentTurns).values({ ...turn, status: "completed" });
  await f.db.insert(agentTurns).values(turn);
  expect(await rejection(f.db.insert(agentTurns).values(turn).execute())).toMatchObject({
    cause: { code: "23505" },
  });
});
