import { realtimeKeys } from "@substrate/contracts/realtime";

import { ensureHumanActor, ensureUserAgentActor } from "../../core/actors/provisioning";
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
import { receivesChange } from "../../testing/realtime";
import { audienceRecipients, resolveReceiver, resolveReceivers } from "./audience";
import { beforeEach, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
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
    expect(await receivesChange(fixture.db, external, audience)).toBe(true);
    expect(await receivesChange(fixture.db, alice, audience)).toBe(true);
    expect(await receivesChange(fixture.db, bob, audience)).toBe(!privateChannel);
    expect(
      await receivesChange(fixture.db, { ...external, organizationId: fixture.orgA }, audience),
    ).toBe(false);
    await fixture.db
      .update(messagingParticipants)
      .set({ leftAt: new Date() })
      .where(eq(messagingParticipants.actorEntityId, fixture.outsider));
    expect(await receivesChange(fixture.db, external, audience)).toBe(false);
  }
});

test("actor notifications, organization and user audiences do not cross identity or workspace", async () => {
  const audience = realtimeKeys.actor(fixture.orgA, fixture.alice);
  expect(await receivesChange(fixture.db, alice, audience)).toBe(true);
  expect(await receivesChange(fixture.db, bob, audience)).toBe(false);
  expect(await receivesChange(fixture.db, external, audience)).toBe(false);
  expect(
    await receivesChange(fixture.db, alice, realtimeKeys.actor(fixture.orgB, fixture.alice)),
  ).toBe(false);
  expect(await receivesChange(fixture.db, alice, realtimeKeys.organization(fixture.orgB))).toBe(
    false,
  );
  expect(
    await receivesChange(
      fixture.db,
      { ...alice, organizationId: null },
      realtimeKeys.user("alice"),
    ),
  ).toBe(true);
  expect(await receivesChange(fixture.db, bob, realtimeKeys.user("alice"))).toBe(false);
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
  expect(await receivesChange(fixture.db, external, audience)).toBe(true);
  expect(
    await receivesChange(fixture.db, { ...external, organizationId: fixture.orgA }, audience),
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
    expect<object | null>(receiver).toEqual({ ...alice, actorId: fixture.alice });
    expect((await audienceRecipients(db, audience))(receiver!)).toBe(true);
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
  expect(receives({ ...receivers[0]!, organizationId: null, actorId: null })).toBe(false);
  expect(queries).toHaveLength(1);
  expect(
    (await audienceRecipients(db, realtimeKeys.conversation(crypto.randomUUID())))(receivers[0]!),
  ).toBe(false);
});

test("a project audience reaches its grantees and admins in one statement, never other members", async () => {
  const project = await fixture.forActor(fixture.alice).projects.create({ name: "Private" });
  const task = await fixture
    .forActor(fixture.alice)
    .tasks.create({ projectEntityId: project.entityId, title: "Hidden" });
  const carol = { userId: "carol", organizationId: fixture.orgA };
  await fixture.db.insert(user).values({
    id: "carol",
    name: "Carol",
    email: "carol@example.com",
    emailVerified: true,
  });
  await fixture.db
    .insert(member)
    .values({ id: "carol-a", userId: "carol", organizationId: fixture.orgA, role: "admin" });
  await ensureHumanActor(fixture.db, carol);
  const { db, queries } = recordQueries();
  const receivers = await Promise.all(
    [alice, bob, carol, external].map((identity) => resolveReceiver(fixture.db, identity)),
  );
  for (const audience of [
    realtimeKeys.entity(fixture.orgA, project.entityId),
    realtimeKeys.entity(fixture.orgA, task.entityId),
  ]) {
    queries.length = 0;
    const receives = await audienceRecipients(db, audience);
    expect(queries).toHaveLength(1);
    // Alice owns the project and Carol is an admin; Bob has no grant; the partner is elsewhere.
    expect(receivers.map((receiver) => receives(receiver!))).toEqual([true, false, true, false]);
  }
  await fixture.forActor(fixture.alice).permissions.grant({
    entityId: project.entityId,
    actorEntityId: fixture.bob,
    level: "view",
  });
  const granted = await audienceRecipients(
    fixture.db,
    realtimeKeys.entity(fixture.orgA, project.entityId),
  );
  expect(granted(receivers[1]!)).toBe(true);
  // The same project ID in another workspace's audience reaches no one here.
  expect(
    (await audienceRecipients(fixture.db, realtimeKeys.entity(fixture.orgB, project.entityId)))(
      receivers[0]!,
    ),
  ).toBe(false);
});

test("a task discussion reaches the people who can view the task, once for everyone, and participant rows grant nothing", async () => {
  const project = await fixture.forActor(fixture.alice).projects.create({ name: "Discussed" });
  const task = await fixture
    .forActor(fixture.alice)
    .tasks.create({ projectEntityId: project.entityId, title: "Discuss" });
  const id = await fixture.forActor(fixture.alice).tasks.ensureDiscussion(task.entityId);
  const carol = { userId: "carol", organizationId: fixture.orgA };
  await fixture.db.insert(user).values({
    id: "carol",
    name: "Carol",
    email: "carol@example.com",
    emailVerified: true,
  });
  await fixture.db
    .insert(member)
    .values({ id: "carol-a", userId: "carol", organizationId: fixture.orgA, role: "admin" });
  await ensureHumanActor(fixture.db, carol);
  // A participant row in a task discussion does not reach anyone.
  await fixture.db.insert(messagingParticipants).values({
    conversationId: id,
    actorEntityId: fixture.bob,
    actorType: "human",
    organizationId: fixture.orgA,
  });
  const receivers = await Promise.all(
    [alice, bob, carol, external].map((identity) => resolveReceiver(fixture.db, identity)),
  );
  const audience = realtimeKeys.conversation(id);
  const { db, queries } = recordQueries();
  const receives = await audienceRecipients(db, audience);
  // One statement reads the conversation; one reads every task reader.
  expect(queries).toHaveLength(2);
  // Alice owns the project and Carol is an admin; Bob has no grant; the partner is elsewhere.
  expect(receivers.map((receiver) => receives(receiver!))).toEqual([true, false, true, false]);
  await fixture.forActor(fixture.alice).permissions.grant({
    entityId: project.entityId,
    actorEntityId: fixture.bob,
    level: "view",
  });
  const granted = await audienceRecipients(fixture.db, audience);
  expect(receivers.map((receiver) => granted(receiver!))).toEqual([true, true, true, false]);
  await fixture.db
    .update(schema.organizationApps)
    .set({ enabled: false })
    .where(
      and(
        eq(schema.organizationApps.organizationId, fixture.orgA),
        eq(schema.organizationApps.appId, "tasks"),
      ),
    );
  const disabled = await audienceRecipients(fixture.db, audience);
  expect(receivers.map((receiver) => disabled(receiver!))).toEqual([false, false, false, false]);
});

test("a contact audience reaches every member, like contact access", async () => {
  const contact = await fixture.forActor(fixture.alice).contacts.create({ displayName: "Shared" });
  const receivers = await Promise.all(
    [alice, bob, external].map((identity) => resolveReceiver(fixture.db, identity)),
  );
  const receives = await audienceRecipients(
    fixture.db,
    realtimeKeys.entity(fixture.orgA, contact.entityId),
  );
  // Bob is a member without a grant: contacts are member-edited, so he reads it.
  expect(receivers.map((receiver) => receives(receiver!))).toEqual([true, true, false]);
});

test("an entity audience reaches no one once the entity is deleted", async () => {
  const project = await fixture.forActor(fixture.alice).projects.create({ name: "Gone" });
  await fixture.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, project.entityId));
  const receiver = await resolveReceiver(fixture.db, alice);
  const receives = await audienceRecipients(
    fixture.db,
    realtimeKeys.entity(fixture.orgA, project.entityId),
  );
  expect(receives(receiver!)).toBe(false);
});

test("batched receivers match single resolution for mixed identities in constant statements", async () => {
  await fixture.db.insert(member).values({
    id: "outsider-a",
    userId: "outsider",
    organizationId: fixture.orgA,
  });
  const partner = await ensureHumanActor(fixture.db, {
    userId: "outsider",
    organizationId: fixture.orgA,
  });
  await fixture.db.insert(user).values([
    { id: "carol", name: "Carol", email: "carol@example.com", emailVerified: false },
    { id: "dave", name: "Dave", email: "dave@example.com", emailVerified: true },
  ]);
  await fixture.db.insert(member).values([
    { id: "carol-a", userId: "carol", organizationId: fixture.orgA },
    { id: "dave-a", userId: "dave", organizationId: fixture.orgA },
  ]);
  await ensureHumanActor(fixture.db, { userId: "carol", organizationId: fixture.orgA });
  await ensureHumanActor(fixture.db, { userId: "dave", organizationId: fixture.orgA });
  // Dave keeps an actor but left; the partner's actor here is disabled.
  await fixture.db.delete(member).where(eq(member.id, "dave-a"));
  await fixture.db
    .update(actors)
    .set({ disabledAt: new Date() })
    .where(eq(actors.entityId, partner.entityId));
  const identities = [
    alice,
    bob,
    external,
    alice,
    { userId: "alice", organizationId: fixture.orgB },
    { userId: "outsider", organizationId: fixture.orgA },
    { userId: "carol", organizationId: fixture.orgA },
    { userId: "carol", organizationId: null },
    { userId: "dave", organizationId: fixture.orgA },
    { userId: "dave", organizationId: null },
    { userId: "alice", organizationId: null },
    { userId: "missing", organizationId: null },
    { userId: "missing", organizationId: fixture.orgA },
    { userId: "org-a", organizationId: "alice" },
  ];
  const singles: Awaited<ReturnType<typeof resolveReceiver>>[] = [];
  for (const identity of identities) singles.push(await resolveReceiver(fixture.db, identity));
  expect(singles.map((receiver) => receiver?.actorId ?? receiver?.userId ?? null)).toEqual([
    fixture.alice,
    fixture.bob,
    fixture.outsider,
    fixture.alice,
    null,
    null,
    null,
    null,
    null,
    "dave",
    "alice",
    null,
    null,
    null,
  ]);
  const counts = [];
  for (const batch of [identities.slice(0, 2).concat(identities.slice(9, 10)), identities]) {
    const { db, queries } = recordQueries();
    const batched = await resolveReceivers(db, batch);
    counts.push(queries.length);
    expect(batched).toEqual(batch.map((identity) => singles[identities.indexOf(identity)] ?? null));
  }
  expect(counts).toEqual([2, 2]);
  expect(await resolveReceivers(fixture.db, [])).toEqual([]);
});

test("disabled, deleted, revoked and unverified viewers lose scoped delivery", async () => {
  const audience = realtimeKeys.organization(fixture.orgA);
  const notificationAudience = realtimeKeys.actor(fixture.orgA, fixture.alice);
  expect(await receivesChange(fixture.db, alice, audience)).toBe(true);
  expect(await receivesChange(fixture.db, alice, notificationAudience)).toBe(true);
  await fixture.db
    .update(actors)
    .set({ disabledAt: new Date() })
    .where(eq(actors.entityId, fixture.alice));
  expect(await receivesChange(fixture.db, alice, audience)).toBe(false);
  expect(await receivesChange(fixture.db, alice, notificationAudience)).toBe(false);
  await fixture.db
    .update(actors)
    .set({ disabledAt: null })
    .where(eq(actors.entityId, fixture.alice));
  await fixture.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, fixture.alice));
  expect(await receivesChange(fixture.db, alice, audience)).toBe(false);
  expect(await receivesChange(fixture.db, alice, notificationAudience)).toBe(false);
  await fixture.db
    .update(entities)
    .set({ deletedAt: null })
    .where(eq(entities.entityId, fixture.alice));
  await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "alice"));
  expect(await receivesChange(fixture.db, alice, audience)).toBe(false);
  expect(await receivesChange(fixture.db, alice, notificationAudience)).toBe(false);
  await fixture.db.update(user).set({ emailVerified: true }).where(eq(user.id, "alice"));
  await fixture.db.delete(member).where(eq(member.id, "alice-a"));
  expect(await receivesChange(fixture.db, alice, audience)).toBe(false);
  expect(await receivesChange(fixture.db, alice, notificationAudience)).toBe(false);
});
