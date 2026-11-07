import { realtimeKeys } from "@startup-os/contracts/realtime";

import {
  entities,
  entityLinks,
  member,
  messagingConversations,
  messagingMessages,
  messagingParticipants,
  messagingReactions,
  notifications,
  session,
  tasks,
  user,
  userAgents,
} from "../../schema";
import { actors, invitation } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { acknowledgeChanges, readChanges } from "./repository";
import { realtimeOutbox } from "./schema";
import { beforeEach, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();
beforeEach(async () => {
  await fixture.db.delete(realtimeOutbox);
});

test("raw message and reaction writes produce content-free conversation events; acknowledgement is selective", async () => {
  const [conversation] = await fixture.db
    .insert(messagingConversations)
    .values({
      organizationId: fixture.orgA,
      kind: "channel",
      name: "Secret channel",
      createdBy: "alice",
    })
    .returning();
  if (!conversation) throw new Error("Missing conversation");
  await fixture.db
    .insert(messagingParticipants)
    .values({ conversationId: conversation.id, userId: "alice", organizationId: fixture.orgA });
  await fixture.db.delete(realtimeOutbox);
  const [message] = await fixture.db
    .insert(messagingMessages)
    .values({ conversationId: conversation.id, authorId: "alice", body: "Secret body" })
    .returning();
  if (!message) throw new Error("Missing message");
  await fixture.db.insert(messagingReactions).values({
    conversationId: conversation.id,
    messageId: message.id,
    userId: "alice",
    emoji: "Secret emoji",
  });
  const changes = await readChanges(fixture.db);
  expect(changes.map(({ audience, domain }) => ({ audience, domain }))).toEqual([
    { audience: realtimeKeys.conversation(conversation.id), domain: "messaging" },
    { audience: realtimeKeys.conversation(conversation.id), domain: "messaging" },
  ]);
  expect(JSON.stringify(changes)).not.toContain("Secret");
  expect(Object.keys(changes[0] ?? {}).sort()).toEqual(["audience", "createdAt", "domain", "id"]);
  const first = changes[0];
  if (!first) throw new Error("Missing change");
  expect(await readChanges(fixture.db, 1)).toEqual([first]);
  await acknowledgeChanges(fixture.db, [first.id]);
  await acknowledgeChanges(fixture.db, []);
  expect(await readChanges(fixture.db)).toEqual(changes.slice(1));
});

test("rolled back writes leave no durable events", async () => {
  let rolledBack = false;
  try {
    await fixture.db.transaction(async (tx) => {
      await tx.update(user).set({ name: "Rolled back" }).where(eq(user.id, "alice"));
      expect(
        (await readChanges(tx)).map(({ audience, domain }) => ({ audience, domain })),
      ).toContainEqual({ audience: realtimeKeys.user("alice"), domain: "profile" });
      throw new Error("rollback");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "rollback") throw error;
    rolledBack = true;
  }
  expect(rolledBack).toBe(true);
  expect(await readChanges(fixture.db)).toEqual([]);
});

test("tasks, links, notifications, auth and agent writes use generic or owner audiences", async () => {
  const repo = fixture.forActor(fixture.alice);
  const project = await repo.projects.create({ name: "Private project" });
  const task = await repo.tasks.create({
    projectEntityId: project.entityId,
    title: "Private task",
  });
  await fixture.db.delete(realtimeOutbox);
  await fixture.db
    .update(tasks)
    .set({ title: "Private changed" })
    .where(eq(tasks.entityId, task.entityId));
  await fixture.db.insert(entityLinks).values({
    organizationId: fixture.orgA,
    sourceEntityId: project.entityId,
    targetEntityId: task.entityId,
    relationType: "related_to",
    createdByActorEntityId: fixture.alice,
  });
  await fixture.db.insert(notifications).values({
    organizationId: fixture.orgA,
    recipientActorEntityId: fixture.alice,
    kind: "assignment",
    eventKey: "secret",
    entityId: task.entityId,
  });
  await fixture.db.insert(session).values({
    id: "session",
    userId: "alice",
    token: "secret-token",
    expiresAt: new Date(Date.now() + 10000),
  });
  await fixture.db.update(user).set({ name: "Private name" }).where(eq(user.id, "alice"));
  await fixture.db.insert(userAgents).values({
    userId: "alice",
    name: "Private agent",
    instructions: "Secret instructions",
    harness: "opencode",
  });
  await fixture.db.delete(member).where(eq(member.id, "bob-a"));
  const changes = (await readChanges(fixture.db)).map(({ audience, domain }) => ({
    audience,
    domain,
  }));
  expect(changes).toContainEqual({
    audience: realtimeKeys.organization(fixture.orgA),
    domain: "tasks",
  });
  expect(changes).toContainEqual({
    audience: realtimeKeys.organization(fixture.orgA),
    domain: "context",
  });
  expect(changes).toContainEqual({
    audience: realtimeKeys.actor(fixture.orgA, fixture.alice),
    domain: "notifications",
  });
  expect(changes).toContainEqual({ audience: realtimeKeys.user("alice"), domain: "session" });
  expect(changes).toContainEqual({ audience: realtimeKeys.user("alice"), domain: "profile" });
  expect(changes).toContainEqual({ audience: realtimeKeys.user("alice"), domain: "agents" });
  expect(changes).toContainEqual({ audience: realtimeKeys.user("bob"), domain: "access" });
  expect(changes).toContainEqual({
    audience: realtimeKeys.organization(fixture.orgA),
    domain: "access",
  });
  expect(JSON.stringify(changes)).not.toMatch(/Private|secret|instructions/);
});

test("entity touches do not invalidate access but lifecycle changes do", async () => {
  await fixture.db
    .update(entities)
    .set({ updatedAt: new Date() })
    .where(eq(entities.entityId, fixture.alice));
  expect(await readChanges(fixture.db)).toEqual([]);
  await fixture.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, fixture.alice));
  expect(
    (await readChanges(fixture.db)).map(({ audience, domain }) => ({ audience, domain })),
  ).toContainEqual({ audience: realtimeKeys.organization(fixture.orgA), domain: "access" });
});

test("participant removal emits a generic access event for the departed viewer workspace", async () => {
  const [conversation] = await fixture.db
    .insert(messagingConversations)
    .values({ organizationId: fixture.orgA, kind: "channel", name: "Private", createdBy: "alice" })
    .returning();
  if (!conversation) throw new Error("Missing conversation");
  await fixture.db
    .insert(messagingParticipants)
    .values({ conversationId: conversation.id, userId: "outsider", organizationId: fixture.orgB });
  await fixture.db.delete(realtimeOutbox);
  await fixture.db
    .delete(messagingParticipants)
    .where(eq(messagingParticipants.conversationId, conversation.id));
  expect(
    (await readChanges(fixture.db)).map(({ audience, domain }) => ({ audience, domain })),
  ).toContainEqual({
    audience: realtimeKeys.organization(fixture.orgB),
    domain: "access",
  });
});

test("invitations notify only the matching verified user and organization without invite data", async () => {
  await fixture.db.update(user).set({ emailVerified: true }).where(eq(user.id, "bob"));
  await fixture.db.delete(realtimeOutbox);
  await fixture.db.insert(invitation).values({
    id: "invite",
    organizationId: fixture.orgB,
    email: "bob@example.com",
    inviterId: "outsider",
    expiresAt: new Date(Date.now() + 10000),
  });
  const changes = (await readChanges(fixture.db)).map(({ audience, domain }) => ({
    audience,
    domain,
  }));
  expect(changes).toContainEqual({
    audience: realtimeKeys.organization(fixture.orgB),
    domain: "organization",
  });
  expect(changes).toContainEqual({ audience: realtimeKeys.user("bob"), domain: "organization" });
  expect(JSON.stringify(changes)).not.toMatch(/email|bob@example|invite/);
  await fixture.db.delete(realtimeOutbox);
  await fixture.db
    .update(invitation)
    .set({ email: "alice@example.com" })
    .where(eq(invitation.id, "invite"));
  const updated = (await readChanges(fixture.db)).map(({ audience, domain }) => ({
    audience,
    domain,
  }));
  expect(updated).toContainEqual({ audience: realtimeKeys.user("bob"), domain: "organization" });
  expect(updated.some((row) => row.audience[0] === "user" && row.audience[1] === "alice")).toBe(
    false,
  );
});

test("user profile updates invalidate member workspaces; actor name edits do not reset access", async () => {
  await fixture.db.update(user).set({ name: "New name" }).where(eq(user.id, "alice"));
  const changes = (await readChanges(fixture.db)).map(({ audience, domain }) => ({
    audience,
    domain,
  }));
  expect(changes).toContainEqual({ audience: realtimeKeys.user("alice"), domain: "profile" });
  expect(changes).toContainEqual({
    audience: realtimeKeys.organization(fixture.orgA),
    domain: "profile",
  });
  expect(changes).not.toContainEqual({
    audience: realtimeKeys.organization(fixture.orgB),
    domain: "profile",
  });
  await fixture.db.delete(realtimeOutbox);
  await fixture.db
    .update(actors)
    .set({ name: "New actor name" })
    .where(eq(actors.entityId, fixture.alice));
  const renamed = await readChanges(fixture.db);
  expect(renamed.map((row) => row.domain)).not.toContain("access");
  expect(renamed.map(({ audience, domain }) => ({ audience, domain }))).toContainEqual({
    audience: realtimeKeys.organization(fixture.orgA),
    domain: "profile",
  });
});
