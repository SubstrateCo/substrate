import { ensureHumanActor } from "../../core/actors/provisioning";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { AccessDeniedError } from "../../errors";
import { entities, taskActivity, messagingParticipants, messagingMessages } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { createAcceptedMessagingService } from "../../testing/messaging";
import { recordQueries } from "../../testing/queries";
import { createContextService } from "../context/service";
import { notifications } from "./schema";
import { createFeedService } from "./service";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const feed = (userId: string) => createFeedService(f.db, { userId, organizationId: f.orgA });

test("notification pages scan past inaccessible targets and filter unread before pagination", async () => {
  const { alice, project } = await setup();
  const hidden = await alice.tasks.create({ projectEntityId: project.entityId, title: "Hidden" });
  const visible = await alice.tasks.create({ projectEntityId: project.entityId, title: "Visible" });
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, hidden.entityId));
  await f.db.insert(notifications).values(
    Array.from({ length: 125 }, (_, index) => ({
      organizationId: f.orgA,
      recipientActorEntityId: f.bob,
      kind: "assignment" as const,
      entityId: index < 100 ? hidden.entityId : visible.entityId,
      eventKey: `page-${index}`,
      createdAt: new Date(1800000000000 - index * 1000),
      readAt: index === 100 ? new Date() : null,
    })),
  );
  const service = feed("bob");
  const first = await service.list(undefined, { limit: 21, unread: true });
  expect(first).toHaveLength(21);
  expect(first.every((item) => item.title === "Visible" && item.readAt === null)).toBe(true);
  const rest = await service.list(first[19]!.id, { limit: 21, unread: true });
  expect(rest).toHaveLength(4);
  expect(rest[0]!.id).toBe(first[20]!.id);
  expect(new Set([...first.slice(0, 20), ...rest].map((item) => item.id)).size).toBe(24);
});

test("feed pages read current work and message targets in one statement without changing page order", async () => {
  const { alice, project, chat, channel } = await setup();
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "First" });
  const other = await alice.tasks.create({ projectEntityId: project.entityId, title: "Second" });
  await chat.addMembers(channel.id, ["bob@example.com"]);
  const message = await chat.sendMessage(channel.id, "Source");
  const secondMessage = await chat.sendMessage(channel.id, "Second source");
  const { db, queries } = recordQueries();
  const service = createFeedService(db, { userId: "bob", organizationId: f.orgA });
  const insert = async (ids: string[], messageIds: string[] = []) => {
    await f.db.delete(notifications);
    await f.db.insert(notifications).values([
      ...ids.map((entityId, index) => ({
        organizationId: f.orgA,
        recipientActorEntityId: f.bob,
        kind: "assignment" as const,
        entityId,
        eventKey: `work-${index}`,
        createdAt: new Date(1800000000000 - index * 1000),
      })),
      ...messageIds.map((messageId, index) => ({
        organizationId: f.orgA,
        recipientActorEntityId: f.bob,
        kind: "mention" as const,
        messageId,
        eventKey: `message-${index}`,
        createdAt: new Date(1800000000500 - index * 1000),
      })),
    ]);
  };
  const read = async () => {
    queries.length = 0;
    const result = await service.list();
    // The workspace check, then the feed with its targets.
    return { result, statements: queries.length };
  };
  await insert([task.entityId]);
  expect((await read()).statements).toBe(2);
  await insert(Array.from({ length: 100 }, () => task.entityId));
  const repeated = await read();
  expect(repeated.result).toHaveLength(100);
  expect(repeated.result.every((row) => row.title === "First")).toBe(true);
  expect(repeated.statements).toBe(2);
  const distinct = [];
  for (let index = 0; index < 20; index++)
    distinct.push(
      await alice.tasks.create({ projectEntityId: project.entityId, title: `Distinct ${index}` }),
    );
  await insert(distinct.map((row) => row.entityId));
  const distinctPage = await read();
  expect(distinctPage.statements).toBe(2);
  expect(distinctPage.result.map((row) => row.title)).toEqual(distinct.map((row) => row.title));
  await insert(
    [],
    Array.from({ length: 100 }, () => message.id),
  );
  const repeatedMessages = await read();
  expect(repeatedMessages.result).toHaveLength(100);
  expect(repeatedMessages.statements).toBe(2);
  await insert([task.entityId, other.entityId, project.entityId], [message.id, secondMessage.id]);
  const mixed = await read();
  expect(mixed.statements).toBe(2);
  expect(mixed.result.map((row) => row.title)).toEqual([
    "You were mentioned",
    "First",
    "You were mentioned",
    "Second",
    "Shared work",
  ]);
  const next = await service.list(mixed.result[1]!.id);
  expect(next.map((row) => row.id)).toEqual(mixed.result.slice(2).map((row) => row.id));
  await f.db.delete(messagingParticipants).where(eq(messagingParticipants.actorEntityId, f.bob));
  expect((await service.list()).map((row) => row.title)).toEqual([
    "First",
    "Second",
    "Shared work",
  ]);
  await alice.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await service.list()).toEqual([]);
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, task.entityId));
  expect((await service.list()).map((row) => row.title)).toEqual(["Second", "Shared work"]);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, project.entityId));
  expect(await service.list()).toEqual([]);
});

test("partner feeds use the selected workspace and current conversation access, not historical notices", async () => {
  const { chat, channel } = await setup();
  await chat.addMembers(channel.id, ["outside@example.com"]);
  const root = await createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  }).sendMessage(channel.id, "Partner root");
  const reply = await chat.sendMessage(channel.id, "Reply", root.id);
  const { db, queries } = recordQueries();
  const partner = createFeedService(db, { userId: "outsider", organizationId: f.orgB });
  expect(await partner.list()).toMatchObject([{ messageId: reply.id, conversationId: channel.id }]);
  expect(queries).toHaveLength(2);
  await f.db.insert(member).values({ id: "outside-a", userId: "outsider", organizationId: f.orgA });
  const outsiderA = await ensureHumanActor(f.db, {
    userId: "outsider",
    organizationId: f.orgA,
  });
  expect(await feed("outsider").list()).toEqual([]);
  // The partner's membership moves from its workspace B actor to its workspace A actor.
  await f.db
    .update(messagingParticipants)
    .set({ leftAt: new Date() })
    .where(eq(messagingParticipants.actorEntityId, f.outsider));
  await f.db.insert(messagingParticipants).values({
    conversationId: channel.id,
    organizationId: f.orgA,
    actorEntityId: outsiderA.entityId,
    actorType: "human",
  });
  expect(await partner.list()).toEqual([]);
  expect(
    await f.db.select().from(notifications).where(eq(notifications.messageId, reply.id)),
  ).toHaveLength(1);
  await f.db.delete(messagingMessages).where(eq(messagingMessages.id, reply.id));
  expect(await partner.list()).toEqual([]);
});

test("feed fills readable pages and keeps tied timestamp ID order across hidden targets", async () => {
  const { alice, project } = await setup();
  const hiddenProject = await alice.projects.create({ name: "Hidden" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Visible" });
  const timestamp = new Date("2026-01-01T00:00:00Z");
  await f.db.insert(notifications).values(
    Array.from({ length: 101 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
      organizationId: f.orgA,
      recipientActorEntityId: f.bob,
      kind: "assignment" as const,
      entityId:
        index === 0 || index === 100 || index === 99 ? task.entityId : hiddenProject.entityId,
      eventKey: `page-${index}`,
      createdAt: timestamp,
    })),
  );
  const page = await feed("bob").list();
  expect(page.map((row) => row.id)).toEqual([
    "00000000-0000-4000-8000-000000000100",
    "00000000-0000-4000-8000-000000000099",
    "00000000-0000-4000-8000-000000000000",
  ]);
  expect(await feed("bob").list(page[1]!.id)).toMatchObject([
    { id: "00000000-0000-4000-8000-000000000000" },
  ]);
});

test("activity batches repeated and distinct source visibility and rechecks it after removal", async () => {
  const { alice, project, chat, channel } = await setup();
  await chat.addMembers(channel.id, ["bob@example.com"]);
  const sources = [
    await chat.sendMessage(channel.id, "One"),
    await chat.sendMessage(channel.id, "Two"),
  ];
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Work" });
  await f.db.insert(taskActivity).values(
    Array.from({ length: 90 }, (_, index) => ({
      organizationId: f.orgA,
      taskEntityId: task.entityId,
      actorEntityId: f.alice,
      action: `Source ${index}`,
      sourceMessageId: sources[index % 2]!.id,
    })),
  );
  const { db, queries } = recordQueries();
  const service = createFeedService(db, { userId: "bob", organizationId: f.orgA });
  expect(await service.activity(task.entityId)).toHaveLength(91);
  expect(queries.filter((query) => query.includes('from "messaging_messages"'))).toHaveLength(1);
  await f.db.delete(messagingParticipants).where(eq(messagingParticipants.actorEntityId, f.bob));
  expect((await service.activity(task.entityId)).map((row) => row.action)).toEqual([
    "Task created",
  ]);
});
async function setup() {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Shared work" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({
    kind: "channel",
    name: "Private",
    private: true,
  });
  return { alice, project, chat, channel };
}

test("assignment notifications exclude self and unchanged assignments; read state is recipient-owned and revocation hides content", async () => {
  const { alice, project } = await setup();
  const task = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Ship",
    assigneeActorEntityId: f.bob,
  });
  expect(await feed("alice").list()).toEqual([]);
  const [notice] = await feed("bob").list();
  expect(notice).toMatchObject({
    title: "Ship",
    kind: "assignment",
    entityId: task.entityId,
    readAt: null,
  });
  await expect(feed("alice").markRead(notice!.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await feed("bob").markRead(notice!.id);
  expect((await feed("bob").list())[0]!.readAt).not.toBeNull();
  await alice.tasks.update(task.entityId, { assigneeActorEntityId: f.bob, title: "Ship" });
  expect(await feed("bob").list()).toHaveLength(1);
  expect((await feed("bob").activity(task.entityId)).map((event) => event.action)).toEqual([
    "Task created",
  ]);
  await alice.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await feed("bob").list()).toEqual([]);
});

test("mentions notify accessible recipients once, reply notifications are deduplicated, and invalid references roll back sends", async () => {
  const { chat, channel, project } = await setup();
  await chat.addMembers(channel.id, ["bob@example.com"]);
  const root = await chat.sendMessage(
    channel.id,
    `Hello @[person:${f.bob}]`,
    undefined,
    crypto.randomUUID(),
  );
  expect(await feed("bob").list()).toMatchObject([{ kind: "mention", messageId: root.id }]);
  const requestId = crypto.randomUUID();
  const bobChat = createAcceptedMessagingService(f.db, { userId: "bob", organizationId: f.orgA });
  const reply = await bobChat.sendMessage(channel.id, "Reply", root.id, requestId);
  await bobChat.sendMessage(channel.id, "Reply", root.id, requestId);
  expect(await feed("alice").list()).toMatchObject([
    { kind: "reply", messageId: reply.id, title: "New thread reply" },
  ]);
  const before = await chat.listMessages(channel.id);
  await expect(chat.sendMessage(channel.id, `Bad @[person:${f.outsider}]`)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await expect(
    chat.sendMessage(channel.id, `Bad @[task:${project.entityId}]`),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await chat.listMessages(channel.id)).toEqual(before);
});

test("notices name the actor and place, and excerpts name only references the recipient can open", async () => {
  const { alice, project, chat, channel } = await setup();
  const image = `/api/v1/files/pictures/avatar/alice?v=${crypto.randomUUID()}`;
  await f.db.update(user).set({ image }).where(eq(user.id, "alice"));
  await chat.addMembers(channel.id, ["bob@example.com"]);
  const hiddenProject = await alice.projects.create({ name: "Hidden" });
  const secret = await alice.tasks.create({
    projectEntityId: hiddenProject.entityId,
    title: "Secret plan",
  });
  const shared = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Ship",
    assigneeActorEntityId: f.bob,
  });
  const message = await chat.sendMessage(
    channel.id,
    `@[person:${f.bob}] see **@[task:${secret.entityId}]** and @[task:${shared.entityId}]`,
  );
  const [mention, assignment] = await feed("bob").list();
  expect(mention).toMatchObject({
    kind: "mention",
    messageId: message.id,
    actorName: "Alice",
    actorImage: image,
    source: { kind: "channel", name: "Private", private: true },
    excerpt: "@Bob see a task and Ship",
  });
  expect(assignment).toMatchObject({
    kind: "assignment",
    entityId: shared.entityId,
    actorName: "Alice",
    actorImage: image,
    source: { kind: "project", name: "Shared work" },
    excerpt: null,
  });
});

test("message, discussion, comment and project actor pictures use existing reads and reflect picture changes", async () => {
  const { alice, project, chat, channel } = await setup();
  const image = `/api/v1/files/pictures/avatar/alice?v=${crypto.randomUUID()}`;
  await f.db.update(user).set({ image }).where(eq(user.id, "alice"));
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Pictures" });
  await alice.tasks.addComment(task.entityId, "Comment");
  const message = await chat.sendMessage(channel.id, `See @[task:${task.entityId}]`);
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  expect((await chat.listMessages(channel.id))[0]).toMatchObject({ authorImage: image });
  expect((await context.messageTarget(channel.id, message.id)).message).toMatchObject({
    authorImage: image,
  });
  expect((await context.related(project.entityId))[0]).toMatchObject({ authorImage: image });
  expect((await alice.tasks.listComments(task.entityId, project.entityId))[0]).toMatchObject({
    authorImage: image,
  });
  const detail = await alice.projects.getDetail(project.entityId);
  expect(detail.actors.find((actor) => actor.entityId === f.alice)).toMatchObject({ image });
  expect(detail.members.find((actor) => actor.actorEntityId === f.alice)).toMatchObject({ image });
  await f.db.update(user).set({ image: null }).where(eq(user.id, "alice"));
  expect((await chat.listMessages(channel.id))[0]).toMatchObject({ authorImage: null });
});

test("private source activity is filtered independently from ordinary task activity", async () => {
  const { project, chat, channel } = await setup();
  const source = await chat.sendMessage(channel.id, "Private evidence");
  const task = await createContextService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
  }).createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: source.id,
    projectEntityId: project.entityId,
    title: "Work",
  });
  expect(await feed("alice").activity(task.entityId)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "Created from a discussion",
        source: { messageId: source.id, conversationId: channel.id, conversationName: "Private" },
      }),
      expect.objectContaining({ action: "Task created", source: null }),
    ]),
  );
  expect((await feed("bob").activity(task.entityId)).map((event) => event.action)).toEqual([
    "Task created",
  ]);
});

test("mark all read covers more than one page, preserves read timestamps, and isolates recipients and workspaces", async () => {
  const { alice, project } = await setup();
  const task = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Shared task",
  });
  const outside = f.forActor(f.outsider, f.orgB);
  const outsideProject = await outside.projects.create({ name: "Other workspace" });
  const outsideTask = await outside.tasks.create({
    projectEntityId: outsideProject.entityId,
    title: "Private",
  });
  const readAt = new Date("2026-01-01T00:00:00Z");
  await f.db.insert(notifications).values([
    ...Array.from({ length: 105 }, (_, index) => ({
      organizationId: f.orgA,
      recipientActorEntityId: f.bob,
      kind: "assignment" as const,
      entityId: task.entityId,
      eventKey: `bulk-${index}`,
      readAt: index === 0 ? readAt : null,
    })),
    {
      organizationId: f.orgA,
      recipientActorEntityId: f.alice,
      kind: "assignment",
      entityId: task.entityId,
      eventKey: "alice-unread",
    },
    {
      organizationId: f.orgB,
      recipientActorEntityId: f.outsider,
      kind: "assignment",
      entityId: outsideTask.entityId,
      eventKey: "outside-unread",
    },
  ]);
  await feed("bob").markAllRead();
  const rows = await f.db.select().from(notifications);
  const mine = rows.filter((row) => row.recipientActorEntityId === f.bob);
  expect(mine).toHaveLength(105);
  expect(mine.every((row) => row.readAt !== null)).toBe(true);
  expect(mine.find((row) => row.eventKey === "bulk-0")!.readAt).toEqual(readAt);
  expect(
    rows.filter((row) => row.recipientActorEntityId !== f.bob).map((row) => row.readAt),
  ).toEqual([null, null]);
  await expect(feed("outsider").markAllRead()).rejects.toBeInstanceOf(AccessDeniedError);
});

test("notification and activity writes roll back with the task transaction", async () => {
  const { project } = await setup();
  await expect(
    f.forActor(f.alice).transaction(async (repos) => {
      await repos.tasks.create({
        projectEntityId: project.entityId,
        title: "Rollback",
        assigneeActorEntityId: f.bob,
      });
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect(
    await f.db.select().from(notifications).where(eq(notifications.recipientActorEntityId, f.bob)),
  ).toEqual([]);
  expect(await f.forActor(f.alice).tasks.list(project.entityId)).toEqual([]);
});
