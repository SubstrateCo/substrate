import { AccessDeniedError, ConflictError } from "../../errors";
import {
  entityGrants,
  entities,
  user,
  member,
  tasks,
  taskActivity,
  notifications,
  actors,
} from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { messagingMessages, messagingParticipants } from "../messaging/schema";
import { createMessagingService } from "../messaging/service";
import { messageEntityReferences, sourceTaskRequests } from "./schema";
import { createContextService } from "./service";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const context = (userId = "alice", organizationId = f.orgA) =>
  createContextService(f.db, { userId, organizationId });

test("thread recipients use one distinct conversation-scoped query and mentions take precedence", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const chat = createMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({
    kind: "channel",
    name: "discussion",
    emails: ["bob@example.com", "outside@example.com"],
  });
  const root = await chat.sendMessage(channel.id, "root");
  const bob = createMessagingService(f.db, { userId: "bob", organizationId: f.orgA });
  for (let i = 0; i < 5; i++) await bob.sendMessage(channel.id, `reply ${i}`, root.id);
  const { db, queries } = recordQueries();
  const partner = createMessagingService(db, { userId: "outsider", organizationId: f.orgB });
  const sent = await partner.sendMessage(channel.id, "partner reply", root.id);
  expect(
    queries.filter((query) => query.includes('"author_id" from "messaging_messages"')),
  ).toHaveLength(1);
  expect(
    await f.db.select().from(notifications).where(eq(notifications.messageId, sent.id)),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        recipientActorEntityId: f.alice,
        organizationId: f.orgA,
        kind: "reply",
      }),
      expect.objectContaining({
        recipientActorEntityId: f.bob,
        organizationId: f.orgA,
        kind: "reply",
      }),
    ]),
  );
  const mentioned = await chat.sendMessage(channel.id, `@[person:${f.bob}]`, root.id);
  expect(
    await f.db.select().from(notifications).where(eq(notifications.messageId, mentioned.id)),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ recipientActorEntityId: f.bob, kind: "mention" }),
      expect.objectContaining({
        recipientActorEntityId: f.outsider,
        organizationId: f.orgB,
        kind: "reply",
      }),
    ]),
  );
  expect(
    (await f.db.select().from(notifications).where(eq(notifications.messageId, mentioned.id)))
      .map((row) => row.recipientActorEntityId)
      .sort(),
  ).toEqual([f.bob, f.outsider].sort());
});
async function setup() {
  await f.db.update(user).set({ emailVerified: true });
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Launch" });
  const chat = createMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const conversation = await chat.createConversation({
    kind: "channel",
    name: "Private discussion",
    private: true,
  });
  const root = await chat.sendMessage(conversation.id, "Customer request");
  const reply = await chat.sendMessage(conversation.id, "Specific detail", root.id);
  return { repos, project, chat, conversation, root, reply };
}

test("page context uses constant reads for one or fifty messages, including empty links", async () => {
  const { chat, conversation, project } = await setup();
  const rows = [];
  for (let i = 0; i < 50; i++) rows.push(await chat.sendMessage(conversation.id, `row ${i}`));
  const { db, queries } = recordQueries();
  const service = createContextService(db, { userId: "alice", organizationId: f.orgA });
  const reads = async (ids: string[]) => {
    queries.length = 0;
    const result = await service.messagePage(ids);
    return { result, count: queries.filter((query) => /^(select|with)/i.test(query)).length };
  };
  const emptyOne = await reads([rows[0]!.id]);
  const emptyPage = await reads(rows.map((row) => row.id));
  expect(emptyPage.result).toHaveLength(50);
  expect(emptyPage.result.every((row) => row.links.length === 0 && row.people.length === 0)).toBe(
    true,
  );
  expect(emptyPage.count).toBe(emptyOne.count);
  expect(emptyPage.count).toBe(6);
  queries.length = 0;
  for (const row of rows) await service.messageLinks(row.id);
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(300);
  for (const row of rows) await context().attach(row.id, project.entityId);
  const one = await reads([rows[0]!.id]);
  const page = await reads(rows.map((row) => row.id));
  expect(page.result.every((row) => row.links[0]?.title === "Launch")).toBe(true);
  expect(page.count).toBe(one.count);
  expect(page.count).toBe(6);
  queries.length = 0;
  for (const row of rows) await service.messageLinks(row.id);
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(650);
  await expect(context("bob").messagePage([rows[0]!.id])).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(service.messagePage([rows[0]!.id, crypto.randomUUID()])).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  const bob = createContextService(db, { userId: "bob", organizationId: f.orgA });
  const deniedReads = async (ids: string[]) => {
    queries.length = 0;
    await expect(bob.messagePage(ids)).rejects.toBeInstanceOf(AccessDeniedError);
    return queries.filter((query) => /^(select|with)/i.test(query)).length;
  };
  expect(await deniedReads(rows.map((row) => row.id))).toBe(await deniedReads([rows[0]!.id]));
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(5);
  expect(queries.some((query) => query.includes('from "message_entity_references"'))).toBe(false);
  const publicConversation = await chat.createConversation({
    kind: "channel",
    name: "Visible page row",
  });
  const visible = await chat.sendMessage(publicConversation.id, "Public message");
  await expect(bob.messagePage([visible.id, rows[0]!.id])).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("page context preserves purposes, removal rights and both work visibility boundaries", async () => {
  const { chat, conversation, root, reply, project, repos } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com", "outside@example.com"]);
  const task = await context().createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: root.id,
    projectEntityId: project.entityId,
    title: "Source work",
  });
  const mention = await chat.sendMessage(conversation.id, `@[task:${task.entityId}]`);
  await context().attach(mention.id, task.entityId);
  await context().attach(reply.id, project.entityId);
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const ids = [root.id, mention.id, reply.id];
  expect(
    (await context().messagePage(ids))
      .flatMap((row) => row.links)
      .map((link) => [link.purpose, link.canRemove]),
  ).toEqual([
    ["source", false],
    ["mention", false],
    ["association", true],
    ["association", true],
  ]);
  expect(
    (await context("bob").messagePage(ids))
      .flatMap((row) => row.links)
      .every((link) => !link.canRemove),
  ).toBe(true);
  expect(
    (await context("outsider", f.orgB).messagePage(ids)).every(
      (row) => row.links.length === 0 && row.people.length === 0,
    ),
  ).toBe(true);
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  await context("bob").attach(root.id, project.entityId);
  expect(
    (await context("bob").messagePage([root.id]))[0]!.links.find(
      (link) => link.entityId === project.entityId,
    )?.canRemove,
  ).toBe(true);
  expect(
    (await context().messagePage([root.id]))[0]!.links.find(
      (link) => link.entityId === project.entityId,
    )?.canRemove,
  ).toBe(true);
  await repos.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  await repos.permissions.grant({ entityId: task.entityId, actorEntityId: f.bob, level: "view" });
  expect((await context("bob").messagePage(ids)).every((row) => row.links.length === 0)).toBe(true);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, task.entityId));
  expect(
    (await context().messagePage([root.id]))[0]!.links.filter(
      (link) => link.entityId === task.entityId,
    ),
  ).toEqual([]);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, project.entityId));
  expect((await context().messagePage(ids)).every((row) => row.links.length === 0)).toBe(true);
});

test("page people resolve parsed tokens in sets and clear inactive, deleted and conversation-hidden actors", async () => {
  const { chat, conversation } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com", "outside@example.com"]);
  const rows = [];
  for (let i = 0; i < 50; i++)
    rows.push(await chat.sendMessage(conversation.id, `@[person:${f.bob}]`));
  const { db, queries } = recordQueries();
  const service = createContextService(db, { userId: "alice", organizationId: f.orgA });
  const one = await service.messagePage([rows[0]!.id]);
  const count = queries.length;
  queries.length = 0;
  const page = await service.messagePage(rows.map((row) => row.id));
  expect(page.every((row) => row.people[0]?.name === "Bob")).toBe(true);
  expect(one[0]!.people).toEqual([{ id: f.bob, name: "Bob" }]);
  expect(queries).toHaveLength(count);
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(7);
  queries.length = 0;
  for (const row of rows) {
    await service.messageLinks(row.id);
    await service.messagePeople(row.id);
  }
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(700);
  expect(
    (await context("outsider", f.orgB).messagePage(rows.map((row) => row.id))).every(
      (row) => row.people.length === 0 && row.links.length === 0,
    ),
  ).toBe(true);
  await f.db
    .update(messagingMessages)
    .set({ body: `@[person:${f.bob}] @[person:${f.outsider}]` })
    .where(eq(messagingMessages.id, rows[0]!.id));
  expect((await service.messagePage([rows[0]!.id]))[0]!.people).toEqual([
    { id: f.bob, name: "Bob" },
  ]);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
  expect((await service.messagePage([rows[0]!.id]))[0]!.people).toEqual([]);
  await f.db.update(actors).set({ disabledAt: null }).where(eq(actors.entityId, f.bob));
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, f.bob));
  expect((await service.messagePage([rows[0]!.id]))[0]!.people).toEqual([]);
  await f.db.update(entities).set({ deletedAt: null }).where(eq(entities.entityId, f.bob));
  await f.db.delete(messagingParticipants).where(eq(messagingParticipants.userId, "bob"));
  expect((await service.messagePage([rows[0]!.id]))[0]!.people).toEqual([]);
  const publicConversation = await chat.createConversation({
    kind: "channel",
    name: "Public mentions",
  });
  const publicMention = await chat.sendMessage(publicConversation.id, `@[person:${f.bob}]`);
  expect(
    (await service.messagePage([rows[0]!.id, publicMention.id])).map((row) => row.people),
  ).toEqual([[], [{ id: f.bob, name: "Bob" }]]);
  await expect(context("bob").messagePage([rows[0]!.id])).rejects.toBeInstanceOf(AccessDeniedError);
  await f.db.delete(member).where(eq(member.userId, "bob"));
  expect((await service.messagePage([publicMention.id]))[0]!.people).toEqual([]);
});

test("source creation is atomic, concurrent-idempotent, and preserves the exact reply without granting access", async () => {
  const { project, reply, root } = await setup();
  const before = await f.db.select().from(entityGrants);
  const input = {
    requestId: crypto.randomUUID(),
    messageId: reply.id,
    projectEntityId: project.entityId,
    title: "Ship request",
    status: "in_review" as const,
  };
  const [a, b] = await Promise.all([
    context().createTaskFromMessage(input),
    context().createTaskFromMessage(input),
  ]);
  expect(a.entityId).toBe(b.entityId);
  expect(a.description).toBe("");
  expect(a.status).toBe("in_review");
  expect(await context().related(a.entityId)).toMatchObject([
    { messageId: reply.id, threadId: root.id, purpose: "source" },
  ]);
  expect(await context().messageLinks(reply.id)).toMatchObject([
    { entityId: a.entityId, title: "Ship request", status: "in_review", statusName: "In Review" },
  ]);
  expect(await f.db.select().from(entityGrants)).toEqual(before);
  expect(await f.db.select().from(sourceTaskRequests)).toHaveLength(1);
  await expect(
    context().createTaskFromMessage({ ...input, title: "Different" }),
  ).rejects.toBeInstanceOf(ConflictError);
  await expect(
    context().createTaskFromMessage({ ...input, status: "completed" }),
  ).rejects.toBeInstanceOf(ConflictError);
});

test("both endpoints are required, membership revocation hides context, and linking never shares", async () => {
  const { project, reply, repos, chat, conversation } = await setup();
  const task = await context().createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: reply.id,
    projectEntityId: project.entityId,
    title: "Private work",
  });
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  expect(await context("bob").related(task.entityId)).toEqual([]);
  await expect(context("bob").messageLinks(reply.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await chat.addMembers(conversation.id, ["bob@example.com", "outside@example.com"]);
  expect(await context("bob").related(task.entityId)).toHaveLength(1);
  expect(await context("outsider", f.orgB).messageLinks(reply.id)).toEqual([]);
  await expect(context("outsider", f.orgB).attach(reply.id, task.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.delete(messagingParticipants).where(eq(messagingParticipants.userId, "bob"));
  expect(await context("bob").related(task.entityId)).toEqual([]);
  await repos.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await context("bob").search({ query: "Private", kind: "task" })).toEqual([]);
});

test("project discussions include task links while checking both work and conversation access", async () => {
  const { project, reply, root, repos, chat } = await setup();
  const task = await context().createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: reply.id,
    projectEntityId: project.entityId,
    title: "Milestone",
  });
  const publicChannel = await chat.createConversation({ kind: "channel", name: "Public updates" });
  const visible = await chat.sendMessage(publicChannel.id, `Review @[task:${task.entityId}]`);
  const otherProject = await repos.projects.create({ name: "Separate work" });
  await context().attach(visible.id, otherProject.entityId);
  await context().attach(root.id, project.entityId);
  const discussions = await context().related(project.entityId);
  expect(discussions.map((item) => item.messageId).sort()).toEqual(
    [reply.id, visible.id, root.id].sort(),
  );
  expect(discussions.find((item) => item.messageId === root.id)!.replyCount).toBe(1);
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await context("bob").related(project.entityId)).toMatchObject([{ messageId: visible.id }]);
  await expect(context("outsider", f.orgB).related(project.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, task.entityId));
  expect(await context().related(project.entityId)).toMatchObject([{ messageId: root.id }]);
});

test("source provenance survives explicit unlinking and caller rollback removes all new work", async () => {
  const { project, reply } = await setup();
  const task = await context().createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: reply.id,
    projectEntityId: project.entityId,
    title: "Work",
  });
  await context().attach(reply.id, task.entityId);
  expect(await context().messageLinks(reply.id)).toHaveLength(2);
  await context().detach(reply.id, task.entityId);
  expect(await context().messageLinks(reply.id)).toMatchObject([{ purpose: "source" }]);
  await expect(
    f.db.transaction(async (tx) => {
      await createContextService(tx, {
        userId: "alice",
        organizationId: f.orgA,
      }).createTaskFromMessage({
        requestId: crypto.randomUUID(),
        messageId: reply.id,
        projectEntityId: project.entityId,
        title: "Rollback",
      });
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect((await f.forActor(f.alice).tasks.list(project.entityId)).map((t) => t.title)).toEqual([
    "Work",
  ]);
  expect(await f.db.select().from(messageEntityReferences)).toHaveLength(1);
});

test("message targets resolve a reply and root, and mismatched conversations fail", async () => {
  const { reply, root, conversation } = await setup();
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    message: { id: reply.id },
    root: { id: root.id },
  });
  await expect(context().messageTarget(crypto.randomUUID(), reply.id)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("linked message targets classify root and reply authors by current viewer membership", async () => {
  const { chat, conversation, root } = await setup();
  await chat.addMembers(conversation.id, ["outside@example.com"]);
  const partner = createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB });
  const reply = await partner.sendMessage(conversation.id, "Partner reply", root.id);
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    message: { id: reply.id, authorExternal: true },
    root: { id: root.id, authorExternal: false },
  });
  expect(await context("outsider", f.orgB).messageTarget(conversation.id, reply.id)).toMatchObject({
    message: { id: reply.id, authorExternal: false },
    root: { id: root.id, authorExternal: true },
  });
  await f.db
    .insert(member)
    .values({ id: "outsider-a", userId: "outsider", organizationId: f.orgA });
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    message: { id: reply.id, authorExternal: false },
    root: { id: root.id, authorExternal: false },
  });
  await expect(context("bob").messageTarget(conversation.id, reply.id)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("source creation rejects task viewers and foreign or unsupported references without partial writes", async () => {
  const { project, reply, repos, conversation, chat } = await setup();
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await chat.addMembers(conversation.id, ["bob@example.com"]);
  await expect(
    context("bob").createTaskFromMessage({
      requestId: crypto.randomUUID(),
      messageId: reply.id,
      projectEntityId: project.entityId,
      title: "Forbidden",
    }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  const contact = await repos.contacts.create({ displayName: "Customer" });
  await expect(context().attach(reply.id, contact.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await f.db.select().from(tasks)).toEqual([]);
  expect(await f.db.select().from(taskActivity)).toEqual([]);
  expect(await f.db.select().from(notifications)).toEqual([]);
  await expect(
    f.db
      .insert(messageEntityReferences)
      .values({
        organizationId: f.orgA,
        conversationId: conversation.id,
        messageId: reply.id,
        entityId: contact.entityId,
        entityType: "task",
        purpose: "association",
        createdByActorEntityId: f.alice,
      })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  expect(await f.db.select().from(messageEntityReferences)).toEqual([]);
});

test("mention and explicit relationships remain independent and target rename and deletion are respected", async () => {
  const { project, repos, chat, conversation } = await setup();
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Before" });
  const sent = await chat.sendMessage(
    conversation.id,
    `Please review @[task:${task.entityId}] @[task:${task.entityId}]`,
  );
  await context().attach(sent.id, task.entityId);
  expect((await context().messageLinks(sent.id)).map((item) => item.purpose).sort()).toEqual([
    "association",
    "mention",
  ]);
  await context().detach(sent.id, task.entityId);
  await repos.tasks.update(task.entityId, { title: "After" });
  expect(await context().messageLinks(sent.id)).toMatchObject([
    { purpose: "mention", title: "After" },
  ]);
  await repos.entities.softDelete(task.entityId);
  expect(await context().messageLinks(sent.id)).toEqual([]);
});
