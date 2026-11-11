import { user } from "../../core/authentication/schema";
import { entityLinks } from "../../core/links/schema";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { createAcceptedMessagingService } from "../../testing/messaging";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { messagingParticipants } from "../messaging/schema";
import { createContextService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
const f = setupDatabase();

test("unnamed conversation results are named after the other approved members", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const dm = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  await f.db.insert(messagingParticipants).values({
    conversationId: dm.id,
    organizationId: f.orgB,
    actorEntityId: f.outsider,
    actorType: "human",
  });
  expect(
    await createContextService(f.db, { userId: "alice", organizationId: f.orgA }).search({
      kind: "conversation",
      query: "",
    }),
  ).toMatchObject([{ id: dm.id, title: "Bob" }]);
});

test("channel browse lists readable channels by name with membership and live member counts", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const bob = createAcceptedMessagingService(f.db, { userId: "bob", organizationId: f.orgA });
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
  await createAcceptedMessagingService(f.db, {
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

test("task, project and combined work search each run one statement", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Search project" });
  const tasks = [];
  for (let i = 0; i < 3; i++)
    tasks.push(
      await alice.tasks.create({ projectEntityId: project.entityId, title: `Search ${i}` }),
    );
  const { db, queries } = recordQueries();
  const context = createContextService(db, { userId: "alice", organizationId: f.orgA });
  const work = (query: string) => /FROM "(tasks|projects)"/.test(query);
  const taskRows = tasks
    .sort((a, b) => a.entityId.localeCompare(b.entityId))
    .map((task) => ({
      id: task.entityId,
      title: task.title,
      kind: "task" as const,
      projectEntityId: project.entityId,
      projectName: project.name,
      status: "not_started" as const,
    }));
  const projectRow = {
    id: project.entityId,
    title: project.name,
    kind: "project" as const,
    projectEntityId: project.entityId,
  };
  // The workspace check, then one work statement.
  expect(await context.search({ query: "Search", kind: "task" })).toEqual(taskRows);
  expect(queries).toHaveLength(2);
  expect(queries[1]).not.toContain('FROM "projects"');
  queries.length = 0;
  expect(await context.search({ query: "Search", kind: "project" })).toEqual([projectRow]);
  expect(queries).toHaveLength(2);
  expect(queries[1]).not.toContain('FROM "tasks"');
  queries.length = 0;
  const all = await context.search({ query: "Search", limit: 100 });
  expect(all.filter((row) => row.kind === "task" || row.kind === "project")).toEqual(
    [...taskRows, projectRow].sort((a, b) => a.id.localeCompare(b.id)),
  );
  const workQueries = queries.filter(work);
  expect(workQueries).toHaveLength(1);
  expect(workQueries[0]).toContain('FROM "tasks"');
  expect(workQueries[0]).toContain('FROM "projects"');
});

test("short fields match substrings, and words match by prefix", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({
    name: "Quarterly 100% plan_v2",
    description: "Budget review",
  });
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({ kind: "channel", name: "Marketing" });
  const message = await chat.sendMessage(channel.id, "Shipping the dashboard redesign");
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  const ids = async (query: string, kind: "project" | "conversation" | "message") =>
    (await context.search({ query, kind })).map((row) => row.id);
  // Substrings of names, including LIKE wildcards taken literally and one-character queries.
  for (const query of ["terl", "100%", "N_V2", "Q"])
    expect(await ids(query, "project")).toEqual([project.entityId]);
  expect(await ids("0_%", "project")).toEqual([]);
  expect(await ids("ARKET", "conversation")).toEqual([channel.id]);
  // Descriptions and message bodies match words and word prefixes, not inner substrings.
  expect(await ids("budg rev", "project")).toEqual([project.entityId]);
  expect(await ids("udget", "project")).toEqual([]);
  expect(await ids("dash, ship!", "message")).toEqual([message.id]);
  expect(await ids("board", "message")).toEqual([]);
  expect(await ids("?!", "message")).toEqual([]);
});

test("identifiers, versions and addresses are found by the same text or by any of their parts", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({ kind: "channel", name: "Releases" });
  const body =
    "Shared 0f8a1b2c-3456-4e9a-8123-9abc45de6f70 in v1.2.3 by sam@example.com, it's note-7";
  const message = await chat.sendMessage(channel.id, body);
  await chat.sendMessage(channel.id, "Shared 0f8a1b2c-9999-4e9a-8123-9abc45de6f70");
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  const ids = async (query: string) =>
    (await context.search({ query, kind: "message" })).map((row) => row.id);
  for (const query of [
    body,
    "0f8a1b2c-3456-4e9a-8123-9abc45de6f70",
    "0f8a1b2c-34",
    "v1.2.3",
    "sam@example.com",
    "it's note-7",
    // Parts after punctuation are words of their own.
    "3456",
    "note 7",
    "example.com",
  ])
    expect(await ids(query)).toEqual([message.id]);
  expect(await ids("0f8a1b2c-3457")).toEqual([]);
});

test("person search filters conversation access before paging and keeps organization boundaries", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const [excluded, caller] = [
    { id: f.alice, userId: "alice", email: "alice@example.com" },
    { id: f.bob, userId: "bob", email: "bob@example.com" },
  ].sort((a, b) => a.id.localeCompare(b.id));
  const scope = { userId: caller!.userId, organizationId: f.orgA };
  const chat = createAcceptedMessagingService(f.db, scope);
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
  await chat.addMembers(channel.id, [excluded!.email]);
  await createAcceptedMessagingService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
  }).addMembers(channel.id, ["outside@example.com"]);
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
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
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

test("message results carry their place, author and an excerpt that names only readable references", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const hidden = await alice.projects.create({ name: "Hidden" });
  const secret = await alice.tasks.create({ projectEntityId: hidden.entityId, title: "Secret" });
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({
    kind: "channel",
    name: "launch",
    emails: ["bob@example.com"],
  });
  const message = await chat.sendMessage(
    channel.id,
    `Rollout for @[task:${secret.entityId}] with @[person:${f.bob}]`,
  );
  const search = (userId: string) =>
    createContextService(f.db, { userId, organizationId: f.orgA }).search({
      query: "Rollout",
      kind: "message",
    });
  const expected = {
    id: message.id,
    conversationName: "launch",
    conversationKind: "channel",
    private: false,
    authorName: "Alice",
  };
  expect(await search("alice")).toMatchObject([
    { ...expected, excerpt: "Rollout for Secret with @Bob" },
  ]);
  expect(await search("bob")).toMatchObject([
    { ...expected, excerpt: "Rollout for a task with @Bob" },
  ]);
});

test("conversation results report the conversation type and privacy", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const open = await alice.createConversation({ kind: "channel", name: "open" });
  const locked = await alice.createConversation({ kind: "channel", name: "locked", private: true });
  const direct = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const results = await createContextService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
  }).search({ query: "", kind: "conversation" });
  const types = new Map(results.map((row) => [row.id, [row.conversationKind, row.private]]));
  expect(types.get(open.id)).toEqual(["channel", false]);
  expect(types.get(locked.id)).toEqual(["channel", true]);
  expect(types.get(direct.id)).toEqual(["dm", true]);
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
  expect(
    await rejection(bob.search({ query: "", relatedToEntityId: other.entityId })),
  ).toBeInstanceOf(AccessDeniedError);
  await alice.entities.softDelete(other.entityId);
  expect(await ids(parent.entityId)).toEqual([project.entityId, child.entityId].sort());
});

test("related search traverses message references in both directions and checks both endpoints", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Work" });
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
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
  expect(await rejection(bob.search({ query: "", relatedToEntityId: message.id }))).toBeInstanceOf(
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
  expect(
    await rejection(outsider.search({ query: "", relatedToEntityId: project.entityId })),
  ).toBeInstanceOf(AccessDeniedError);
  await f.db.delete(messagingParticipants).where(eq(messagingParticipants.actorEntityId, f.bob));
  expect(await rejection(bob.search({ query: "", relatedToEntityId: channel.id }))).toBeInstanceOf(
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
