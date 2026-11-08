import { user } from "../../core/authentication/schema";
import { entityLinks } from "../../core/links/schema";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { messagingParticipants } from "../messaging/schema";
import { createMessagingService } from "../messaging/service";
import { createContextService } from "./service";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
const f = setupDatabase();

test("channel browse lists readable channels by name with membership and live member counts", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = createMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const bob = createMessagingService(f.db, { userId: "bob", organizationId: f.orgA });
  const zeta = await alice.createConversation({ kind: "channel", name: "zeta" });
  const alpha = await alice.createConversation({
    kind: "channel",
    name: "Alpha",
    emails: ["bob@example.com"],
  });
  const mid = await alice.createConversation({ kind: "channel", name: "mid" });
  await alice.createConversation({ kind: "channel", name: "hidden", private: true });
  await alice.createConversation({
    kind: "group",
    emails: ["bob@example.com", "outside@example.com"],
  });
  await createMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  }).createConversation({ kind: "channel", name: "foreign" });
  await bob.sendMessage(mid.id, "hello");
  await bob.leaveConversation(mid.id);
  const browse = (after?: string) =>
    createContextService(f.db, { userId: "bob", organizationId: f.orgA }).search({
      kind: "channel",
      query: "",
      limit: 2,
      after,
    });
  const channel = (
    row: { id: string; name: string | null },
    membership: "joined" | "left" | "none",
    memberCount: number,
  ) => ({
    id: row.id,
    kind: "channel" as const,
    title: row.name!,
    conversationId: row.id,
    private: false,
    membership,
    memberCount,
  });
  // Case-insensitive name order; the page boundary continues by name, not by ID.
  const first = await browse();
  expect(first).toEqual([channel(alpha, "joined", 2), channel(mid, "left", 1)]);
  expect(await browse(first[1]!.id)).toEqual([channel(zeta, "none", 1)]);
});

test("30-task search and project search each project authorized output in one statement", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Search project" });
  const tasks = [];
  for (let i = 0; i < 30; i++)
    tasks.push(
      await alice.tasks.create({ projectEntityId: project.entityId, title: `Search ${i}` }),
    );
  const { db, queries } = recordQueries();
  const context = createContextService(db, { userId: "alice", organizationId: f.orgA });
  const results = await context.search({ query: "Search", kind: "task" });
  expect(queries.slice(queries.findIndex((query) => query.includes('from "tasks"')))).toHaveLength(
    1,
  );
  expect(results).toEqual(
    tasks
      .sort((a, b) => a.entityId.localeCompare(b.entityId))
      .map((task) => ({
        id: task.entityId,
        title: task.title,
        kind: "task",
        projectEntityId: project.entityId,
      })),
  );
  expect(queries.filter((query) => query.includes('from "tasks"'))).toHaveLength(1);
  expect(queries.filter((query) => query.includes('from "projects"'))).toHaveLength(0);
  queries.length = 0;
  expect(await context.search({ query: "Search", kind: "project" })).toEqual([
    {
      id: project.entityId,
      title: project.name,
      kind: "project",
      projectEntityId: project.entityId,
    },
  ]);
  expect(queries.filter((query) => query.includes('from "projects"'))).toHaveLength(1);
  expect(
    queries.slice(queries.findIndex((query) => query.includes('from "projects"'))),
  ).toHaveLength(1);
});

test("person search filters conversation access before paging and keeps organization boundaries", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const [excluded, caller] = [
    { id: f.alice, userId: "alice", email: "alice@example.com" },
    { id: f.bob, userId: "bob", email: "bob@example.com" },
  ].sort((a, b) => a.id.localeCompare(b.id));
  const scope = { userId: caller!.userId, organizationId: f.orgA };
  const chat = createMessagingService(f.db, scope);
  const channel = await chat.createConversation({ kind: "channel", name: "People", private: true });
  const context = createContextService(f.db, scope);
  const search = (after?: string) =>
    context.search({ query: "", kind: "person", conversationId: channel.id, limit: 1, after });
  expect((await search()).map((row) => row.id)).toEqual([caller!.id]);
  const otherContext = createContextService(f.db, {
    userId: excluded!.userId,
    organizationId: f.orgA,
  });
  expect(
    await otherContext.search({ query: "", kind: "person", conversationId: channel.id }),
  ).toEqual([]);
  await chat.addMembers(channel.id, [excluded!.email, "outside@example.com"]);
  const first = await search();
  const second = await search(first[0]!.id);
  expect(first.map((row) => row.id)).toEqual([excluded!.id]);
  expect(second.map((row) => row.id)).toEqual([caller!.id]);
  expect(await search(second[0]!.id)).toEqual([]);
  const publicChannel = await chat.createConversation({ kind: "channel", name: "Everyone" });
  expect(
    (await context.search({ query: "", kind: "person", conversationId: publicChannel.id })).map(
      (row) => row.id,
    ),
  ).toEqual([excluded!.id, caller!.id]);
});

test("editable project search applies access checks before limiting results", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const projects = [
    await alice.projects.create({ name: "Search one" }),
    await alice.projects.create({ name: "Search two" }),
  ];
  projects.sort((a, b) => a.entityId.localeCompare(b.entityId));
  const [readOnly, editable] = projects;
  await alice.permissions.grant({
    entityId: readOnly!.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await alice.permissions.grant({
    entityId: editable!.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  const bob = createContextService(f.db, { userId: "bob", organizationId: f.orgA });
  expect(
    (await bob.search({ query: "Search", kind: "project", editable: true, limit: 1 })).map(
      (row) => row.id,
    ),
  ).toEqual([editable!.entityId]);
});

test("task search filters project access before limiting results", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const first = await alice.projects.create({ name: "One" });
  const second = await alice.projects.create({ name: "Two" });
  const tasks = [
    await alice.tasks.create({ projectEntityId: first.entityId, title: "Search one" }),
    await alice.tasks.create({ projectEntityId: second.entityId, title: "Search two" }),
  ].sort((a, b) => a.entityId.localeCompare(b.entityId));
  const [blocked, allowed] = tasks;
  await alice.permissions.grant({
    entityId: blocked!.projectEntityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await alice.permissions.grant({
    entityId: blocked!.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  await alice.permissions.grant({
    entityId: allowed!.projectEntityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  const bob = createContextService(f.db, { userId: "bob", organizationId: f.orgA });
  expect(
    (await bob.search({ query: "Search", kind: "task", editable: true, limit: 1 })).map(
      (row) => row.id,
    ),
  ).toEqual([allowed!.entityId]);
  await alice.permissions.revoke({ entityId: blocked!.projectEntityId, actorEntityId: f.bob });
  expect(
    (await bob.search({ query: "Search", kind: "task", limit: 1 })).map((row) => row.id),
  ).toEqual([allowed!.entityId]);
});

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
