import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { messagingConversations, messagingParticipants, user, userAgents } from "../../schema";
import { agentWorkFixture } from "../../testing/agent-work";
import { setupDatabase } from "../../testing/database";
import { approveFixtureParticipants } from "../../testing/messaging";
import { receivesChange } from "../../testing/realtime";
import { dmTurn } from "../../testing/turns";
import {
  agentRefreshHints,
  conversationRemovalHints,
  invitationRefreshHints,
  profileRefreshHints,
  projectAccessRefreshHints,
} from "./routing";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();

test("profile changes refresh shared conversation labels across workspace boundaries without granting access", async () => {
  await fixture.db.update(user).set({ emailVerified: true });
  const [conversation] = await fixture.db
    .insert(messagingConversations)
    .values({
      organizationId: fixture.orgA,
      kind: "channel",
      private: true,
      name: "Partner",
      createdBy: "alice",
    })
    .returning();
  if (!conversation) throw new Error("Missing conversation");
  await fixture.db.insert(messagingParticipants).values([
    {
      conversationId: conversation.id,
      actorEntityId: fixture.alice,
      actorType: "human",
      organizationId: fixture.orgA,
    },
    {
      conversationId: conversation.id,
      actorEntityId: fixture.outsider,
      actorType: "human",
      organizationId: fixture.orgB,
    },
  ]);
  // Workspace conversations, joined or left, are covered by the organization hint.
  await approveFixtureParticipants(fixture.db, conversation.id);
  for (const leftAt of [null, new Date()]) {
    const [internal] = await fixture.db
      .insert(messagingConversations)
      .values({ organizationId: fixture.orgA, kind: "group", createdBy: "alice" })
      .returning();
    await fixture.db.insert(messagingParticipants).values(
      [fixture.alice, fixture.bob].map((actorEntityId) => ({
        conversationId: internal!.id,
        actorEntityId,
        actorType: "human" as const,
        organizationId: fixture.orgA,
        leftAt: actorEntityId === fixture.alice ? leftAt : null,
      })),
    );
  }
  const hints = await profileRefreshHints(fixture.db, "alice");
  expect(hints).toEqual([
    { audience: realtimeKeys.user("alice"), domain: "profile" },
    { audience: realtimeKeys.organization(fixture.orgA), domain: "profile" },
    { audience: realtimeKeys.conversation(conversation.id), domain: "profile" },
  ]);
  const shared = hints[2];
  expect(
    await receivesChange(
      fixture.db,
      { userId: "outsider", organizationId: fixture.orgB },
      shared!.audience,
    ),
  ).toBe(true);
  expect(
    await receivesChange(
      fixture.db,
      { userId: "bob", organizationId: fixture.orgA },
      shared!.audience,
    ),
  ).toBe(false);
});

test("project access hints reset only the granted actor and an agent's owner", async () => {
  const workspace = realtimeKeys.organization(fixture.orgA);
  expect(await projectAccessRefreshHints(fixture.db, fixture.orgA, fixture.bob)).toEqual([
    { audience: workspace, domain: "tasks" },
    { audience: realtimeKeys.actor(fixture.orgA, fixture.bob), domain: "access" },
  ]);
  const [definition] = await fixture.db
    .insert(userAgents)
    .values({
      userId: "alice",
      name: "Helper",
      instructions: "",
      avatarCode: "100000",
      harness: "opencode",
    })
    .returning();
  const agent = await ensureUserAgentActor(fixture.db, {
    organizationId: fixture.orgA,
    userId: "alice",
    userAgentId: definition!.id,
  });
  expect(await projectAccessRefreshHints(fixture.db, fixture.orgA, agent.entityId)).toEqual([
    { audience: workspace, domain: "tasks" },
    { audience: realtimeKeys.actor(fixture.orgA, agent.entityId), domain: "access" },
    { audience: realtimeKeys.actor(fixture.orgA, fixture.alice), domain: "access" },
  ]);
});

// Workspace members see agents only as names and pictures, so they need a label refresh, not the
// forced session recheck and private-cache reset of an access hint.
test("agent changes refresh the owner's agents and workspace labels without an access hint", async () => {
  const [definition] = await fixture.db
    .insert(userAgents)
    .values({
      userId: "alice",
      name: "Helper",
      instructions: "",
      avatarCode: "100000",
      harness: "opencode",
    })
    .returning();
  await ensureUserAgentActor(fixture.db, {
    organizationId: fixture.orgA,
    userId: "alice",
    userAgentId: definition!.id,
  });
  expect(await agentRefreshHints(fixture.db, "alice")).toEqual([
    { audience: realtimeKeys.user("alice"), domain: "agents" },
    { audience: realtimeKeys.organization(fixture.orgA), domain: "profile" },
  ]);
});

test("invitation hints reach only the verified matching account and inviting workspace", async () => {
  await fixture.db.update(user).set({ emailVerified: true }).where(eq(user.id, "outsider"));
  const [recipient] = await fixture.db.select().from(user).where(eq(user.id, "outsider"));
  if (!recipient) throw new Error("Missing recipient");
  expect(await invitationRefreshHints(fixture.db, fixture.orgA, recipient.email)).toEqual([
    { audience: realtimeKeys.organization(fixture.orgA), domain: "organization" },
    { audience: realtimeKeys.user("outsider"), domain: "organization" },
  ]);
  await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "outsider"));
  expect(await invitationRefreshHints(fixture.db, fixture.orgA, recipient.email)).toEqual([
    { audience: realtimeKeys.organization(fixture.orgA), domain: "organization" },
  ]);
});

// Deleting a conversation deletes its agent requests without a wake, so the owner's views and the
// home desktop's open-request cache need a refresh.
test("removing a conversation with an agent request refreshes the owner's agent work", async () => {
  const { dm, call } = await agentWorkFixture(fixture);
  const removal = (id: string) =>
    conversationRemovalHints(fixture.db, [{ id, organizationId: fixture.orgA }]);
  const agentWork: RealtimeHint = { audience: realtimeKeys.user("alice"), domain: "agent-work" };
  expect(await removal(dm.id)).not.toContainEqual(agentWork);
  await call(
    "reply",
    {
      requestId: crypto.randomUUID(),
      body: "Which week?",
      ask: { question: "Which week?", options: [{ label: "This week" }, { label: "Next week" }] },
    },
    dmTurn(dm.id),
  );
  const hints = await removal(dm.id);
  expect(hints.filter((hint) => hint.domain === "agent-work")).toEqual([agentWork]);
});
