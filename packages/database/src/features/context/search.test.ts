/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { setupDatabase } from "../../testing/database";
import { user } from "../../core/authentication/schema";
import { createContextService } from "./service";
import { createMessagingService } from "../messaging/service";
import { AccessDeniedError } from "../../errors";
import { eq } from "drizzle-orm";
import { entityLinks } from "../../core/links/schema";
import { messagingParticipants } from "../messaging/schema";
const f = setupDatabase();

test("search finds each supported domain without leaking private work, and cursor pages do not overlap", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Launch" });
  const titles = ["Launch one", "Launch two", "Launch three"];
  for (const title of titles)
    await alice.tasks.create({ projectEntityId: project.entityId, title });
  const chat = createMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({ kind: "channel", name: "Launch", private: true });
  const message = await chat.sendMessage(channel.id, "Launch discussion");
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  expect((await context.search({ query: "Launch" })).map((row) => row.kind).sort()).toEqual([
    "conversation",
    "message",
    "project",
    "task",
    "task",
    "task",
  ]);
  expect(await context.search({ query: "Laun", kind: "task" })).toHaveLength(3);
  const first = await context.search({ query: "Launch", kind: "task", limit: 2 });
  const second = await context.search({
    query: "Launch",
    kind: "task",
    after: first.at(-1)!.id,
    limit: 2,
  });
  expect(new Set([...first, ...second].map((row) => row.id)).size).toBe(3);
  const bob = createContextService(f.db, { userId: "bob", organizationId: f.orgA });
  expect(await bob.search({ query: "Launch" })).toEqual([]);
  await chat.addMembers(channel.id, ["bob@example.com"]);
  expect((await bob.search({ query: "Launch", kind: "message" })).map((row) => row.id)).toEqual([
    message.id,
  ]);
  await alice.entities.softDelete(project.entityId);
  expect(await context.search({ query: "Launch", kind: "task" })).toEqual([]);
});

test("related search is one-hop, bidirectional, and includes structural membership without storing links", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Project" });
  const parent = await alice.tasks.create({ projectEntityId: project.entityId, title: "Parent" });
  const child = await alice.tasks.create({
    projectEntityId: project.entityId,
    parentTaskEntityId: parent.entityId,
    title: "Child",
  });
  const other = await alice.projects.create({ name: "Other" });
  const distant = await alice.projects.create({ name: "Distant" });
  await alice.links.create({
    sourceEntityId: other.entityId,
    targetEntityId: parent.entityId,
    relationType: "related_to",
  });
  await alice.links.create({
    sourceEntityId: other.entityId,
    targetEntityId: distant.entityId,
    relationType: "related_to",
  });
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  const ids = async (relatedToEntityId: string) =>
    (await context.search({ query: "", relatedToEntityId })).map((row) => row.id).sort();
  expect(await ids(parent.entityId)).toEqual(
    [project.entityId, child.entityId, other.entityId].sort(),
  );
  expect(await ids(other.entityId)).toEqual([parent.entityId, distant.entityId].sort());
  expect(await ids(project.entityId)).toEqual([parent.entityId, child.entityId].sort());
  expect(await ids(child.entityId)).toEqual([project.entityId, parent.entityId].sort());
  const first = await context.search({ query: "", relatedToEntityId: project.entityId, limit: 1 });
  const next = await context.search({
    query: "",
    relatedToEntityId: project.entityId,
    after: first[0]!.id,
    limit: 1,
  });
  expect([...first, ...next].map((row) => row.id).sort()).toEqual(
    [parent.entityId, child.entityId].sort(),
  );
  expect(
    (await context.search({ query: "Other", relatedToEntityId: parent.entityId })).map(
      (row) => row.id,
    ),
  ).toEqual([other.entityId]);
  expect(await f.db.select().from(entityLinks)).toHaveLength(2);
  const bob = createContextService(f.db, { userId: "bob", organizationId: f.orgA });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(
    (await bob.search({ query: "", relatedToEntityId: parent.entityId }))
      .map((row) => row.id)
      .sort(),
  ).toEqual([project.entityId, child.entityId].sort());
  await expect(bob.search({ query: "", relatedToEntityId: other.entityId })).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await alice.entities.softDelete(other.entityId);
  expect(await ids(parent.entityId)).toEqual([project.entityId, child.entityId].sort());
});

test("related search traverses message references in both directions and checks both endpoints", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Work" });
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  const chat = createMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({
    kind: "channel",
    name: "Discussion",
    private: true,
  });
  const message = await chat.sendMessage(channel.id, `Mention @[project:${project.entityId}]`);
  await context.attach(message.id, project.entityId);
  const ids = async (relatedToEntityId: string) =>
    (await context.search({ query: "", relatedToEntityId })).map((row) => row.id).sort();
  expect(await ids(project.entityId)).toEqual([message.id, channel.id].sort());
  expect(await ids(message.id)).toEqual([project.entityId, channel.id].sort());
  expect(await ids(channel.id)).toEqual([project.entityId, message.id].sort());
  const bob = createContextService(f.db, { userId: "bob", organizationId: f.orgA });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await bob.search({ query: "", relatedToEntityId: project.entityId })).toEqual([]);
  await expect(bob.search({ query: "", relatedToEntityId: message.id })).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await chat.addMembers(channel.id, ["bob@example.com", "outside@example.com"]);
  expect(
    (await bob.search({ query: "", relatedToEntityId: project.entityId }))
      .map((row) => row.id)
      .sort(),
  ).toEqual([message.id, channel.id].sort());
  await alice.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await bob.search({ query: "", kind: "project", relatedToEntityId: message.id })).toEqual(
    [],
  );
  const outsider = createContextService(f.db, { userId: "outsider", organizationId: f.orgB });
  expect(
    await outsider.search({ query: "", kind: "project", relatedToEntityId: message.id }),
  ).toEqual([]);
  await expect(
    outsider.search({ query: "", relatedToEntityId: project.entityId }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await f.db.delete(messagingParticipants).where(eq(messagingParticipants.userId, "bob"));
  await expect(bob.search({ query: "", relatedToEntityId: channel.id })).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  const sourced = await context.createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: message.id,
    projectEntityId: project.entityId,
    title: "From discussion",
  });
  expect(
    (await context.search({ query: "", kind: "task", relatedToEntityId: message.id })).map(
      (row) => row.id,
    ),
  ).toEqual([sourced.entityId]);
  expect(
    (await context.search({ query: "", kind: "message", relatedToEntityId: sourced.entityId })).map(
      (row) => row.id,
    ),
  ).toEqual([message.id]);
});
