import { realtimeKeys } from "@startup-os/contracts/realtime";

import * as schema from "../../schema";
import {
  actors,
  entities,
  member,
  messagingConversations,
  messagingParticipants,
  user,
} from "../../schema";
import { setupDatabase } from "../../testing/database";
import { approveFixtureParticipants } from "../../testing/messaging";
import { recordQueries } from "../../testing/queries";
import { ensureHumanActor, ensureUserAgentActor } from "../actors/provisioning";
import {
  audienceRecipients,
  canReceiveAudience,
  canReceiveChange,
  resolveReceiver,
} from "./audience";
import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";

const fixture = setupDatabase();
beforeEach(async () => {
  await fixture.db.update(user).set({ emailVerified: true });
});
const alice = { userId: "alice", organizationId: "org-a" };
const bob = { userId: "bob", organizationId: "org-a" };
const external = { userId: "outsider", organizationId: "org-b" };

test("private and public external channels require a participant in the viewer workspace", async () => {
  for (const privateChannel of [true, false]) {
    const [conversation] = await fixture.db
      .insert(messagingConversations)
      .values({
        organizationId: fixture.orgA,
        kind: "channel",
        private: privateChannel,
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
    const audience = realtimeKeys.conversation(conversation.id);
    await approveFixtureParticipants(fixture.db, conversation.id);
    expect(await canReceiveChange(fixture.db, external, audience)).toBe(true);
    expect(await canReceiveChange(fixture.db, alice, audience)).toBe(true);
    expect(await canReceiveChange(fixture.db, bob, audience)).toBe(!privateChannel);
    expect(
      await canReceiveChange(fixture.db, { ...external, organizationId: fixture.orgA }, audience),
    ).toBe(false);
    await fixture.db
      .update(messagingParticipants)
      .set({ leftAt: new Date() })
      .where(eq(messagingParticipants.actorEntityId, fixture.outsider));
    expect(await canReceiveChange(fixture.db, external, audience)).toBe(false);
  }
});

test("actor notifications, organization and user audiences do not cross identity or workspace", async () => {
  const audience = realtimeKeys.actor(fixture.orgA, fixture.alice);
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(true);
  expect(await canReceiveChange(fixture.db, bob, audience)).toBe(false);
  expect(await canReceiveChange(fixture.db, external, audience)).toBe(false);
  expect(
    await canReceiveChange(fixture.db, alice, realtimeKeys.actor(fixture.orgB, fixture.alice)),
  ).toBe(false);
  expect(await canReceiveChange(fixture.db, alice, realtimeKeys.organization(fixture.orgB))).toBe(
    false,
  );
  expect(
    await canReceiveChange(
      fixture.db,
      { ...alice, organizationId: null },
      realtimeKeys.user("alice"),
    ),
  ).toBe(true);
  expect(await canReceiveChange(fixture.db, bob, realtimeKeys.user("alice"))).toBe(false);
});

test("a partner with membership in both organizations receives private channel events only in its participant workspace", async () => {
  await fixture.db.insert(member).values({
    id: "outsider-a",
    userId: "outsider",
    organizationId: fixture.orgA,
  });
  await ensureHumanActor(fixture.db, {
    userId: "outsider",
    organizationId: fixture.orgA,
    name: "Partner in A",
  });
  const [conversation] = await fixture.db
    .insert(messagingConversations)
    .values({
      organizationId: fixture.orgA,
      kind: "channel",
      private: true,
      name: "Partner workspace boundary",
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
  const audience = realtimeKeys.conversation(conversation.id);
  await approveFixtureParticipants(fixture.db, conversation.id);
  expect(await canReceiveChange(fixture.db, external, audience)).toBe(true);
  expect(
    await canReceiveChange(fixture.db, { ...external, organizationId: fixture.orgA }, audience),
  ).toBe(false);
});

test("a delivery resolves the receiver once and checks only conversation audiences in SQL", async () => {
  const [conversation] = await fixture.db
    .insert(messagingConversations)
    .values({ organizationId: fixture.orgA, kind: "channel", name: "Counted", createdBy: "alice" })
    .returning();
  if (!conversation) throw new Error("Missing conversation");
  await fixture.db.insert(messagingParticipants).values({
    conversationId: conversation.id,
    actorEntityId: fixture.alice,
    actorType: "human",
    organizationId: fixture.orgA,
  });
  const statements: string[] = [];
  const db = drizzle(fixture.db.$client, {
    schema,
    logger: { logQuery: (query) => statements.push(query) },
  });
  const counts: Record<string, number> = {};
  for (const audience of [
    realtimeKeys.organization(fixture.orgA),
    realtimeKeys.actor(fixture.orgA, fixture.alice),
    realtimeKeys.conversation(conversation.id),
  ]) {
    statements.length = 0;
    const receiver = await resolveReceiver(db, alice);
    expect(receiver).toEqual({ ...alice, actorId: fixture.alice });
    expect(await canReceiveAudience(db, receiver!, audience)).toBe(true);
    counts[audience[0]] = statements.length;
  }
  expect(counts).toEqual({ organization: 1, actor: 1, conversation: 2 });
});

test("a conversation audience resolves in one statement for every receiver, and agent rows grant nothing", async () => {
  const [conversation] = await fixture.db
    .insert(messagingConversations)
    .values({
      organizationId: fixture.orgA,
      kind: "group",
      private: true,
      createdBy: "alice",
    })
    .returning();
  if (!conversation) throw new Error("Missing conversation");
  const [definition] = await fixture.db
    .insert(schema.userAgents)
    .values({ userId: "bob", name: "Helper", instructions: "", harness: "opencode" })
    .returning();
  const agent = await ensureUserAgentActor(fixture.db, {
    organizationId: fixture.orgA,
    userId: "bob",
    userAgentId: definition!.id,
  });
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
    {
      conversationId: conversation.id,
      actorEntityId: agent.entityId,
      actorType: "agent",
      organizationId: fixture.orgA,
    },
  ]);
  const { db, queries } = recordQueries();
  await approveFixtureParticipants(fixture.db, conversation.id);
  const receives = await audienceRecipients(db, realtimeKeys.conversation(conversation.id));
  expect(queries).toHaveLength(1);
  const receivers = await Promise.all(
    [alice, bob, external].map((identity) => resolveReceiver(fixture.db, identity)),
  );
  expect(receivers.map((receiver) => receives(receiver!))).toEqual([true, false, true]);
  // A partner's identity in another workspace is not the participant.
  expect(receives({ ...receivers[2]!, organizationId: fixture.orgA })).toBe(false);
  expect(receives({ userId: "alice", organizationId: null, actorId: null })).toBe(false);
  expect(queries).toHaveLength(1);
  expect(
    (await audienceRecipients(db, realtimeKeys.conversation(crypto.randomUUID())))(receivers[0]!),
  ).toBe(false);
});

test("disabled, deleted, revoked and unverified viewers lose scoped delivery", async () => {
  const audience = realtimeKeys.organization(fixture.orgA);
  const notificationAudience = realtimeKeys.actor(fixture.orgA, fixture.alice);
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(true);
  expect(await canReceiveChange(fixture.db, alice, notificationAudience)).toBe(true);
  await fixture.db
    .update(actors)
    .set({ disabledAt: new Date() })
    .where(eq(actors.entityId, fixture.alice));
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(false);
  expect(await canReceiveChange(fixture.db, alice, notificationAudience)).toBe(false);
  await fixture.db
    .update(actors)
    .set({ disabledAt: null })
    .where(eq(actors.entityId, fixture.alice));
  await fixture.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, fixture.alice));
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(false);
  expect(await canReceiveChange(fixture.db, alice, notificationAudience)).toBe(false);
  await fixture.db
    .update(entities)
    .set({ deletedAt: null })
    .where(eq(entities.entityId, fixture.alice));
  await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "alice"));
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(false);
  expect(await canReceiveChange(fixture.db, alice, notificationAudience)).toBe(false);
  await fixture.db.update(user).set({ emailVerified: true }).where(eq(user.id, "alice"));
  await fixture.db.delete(member).where(eq(member.id, "alice-a"));
  expect(await canReceiveChange(fixture.db, alice, audience)).toBe(false);
  expect(await canReceiveChange(fixture.db, alice, notificationAudience)).toBe(false);
});
