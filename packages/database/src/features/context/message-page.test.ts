import { AccessDeniedError, ValidationError } from "../../errors";
import { entities, member, actors } from "../../schema";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { messagingMessages, messagingParticipants } from "../messaging/schema";
import { messageEntityReferences } from "./schema";
import { createContextService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const context = (userId = "alice", organizationId = f.orgA) =>
  createContextService(f.db, { userId, organizationId });

const setup = () => contextConversation(f);

async function checkedPage(messageIds: string[], userId = "alice", organizationId = f.orgA) {
  const service = context(userId, organizationId);
  const page = await service.messagePage(messageIds);
  for (const row of page) {
    expect(await service.messageLinks(row.messageId)).toEqual(row.links);
    expect(await service.messagePeople(row.messageId)).toEqual(row.people);
  }
  return page;
}

/** Alice's root messages in one statement, for reads that only need many rows. */
function insertMessages(conversationId: string, bodies: string[]) {
  return f.db
    .insert(messagingMessages)
    .values(
      bodies.map((body) => ({
        conversationId,
        authorActorEntityId: f.alice,
        authorOrganizationId: f.orgA,
        body,
      })),
    )
    .returning();
}

test("page context uses constant reads for one or fifty messages, including empty links", async () => {
  const { chat, conversation, project } = await setup();
  const rows = await insertMessages(
    conversation.id,
    Array.from({ length: 50 }, (_, i) => `row ${i}`),
  );
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
  expect(emptyPage.count).toBe(3);
  queries.length = 0;
  await service.messageLinks(rows[0]!.id);
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(3);
  await context().attach(rows[0]!.id, project.entityId);
  // The same association that attach saved, for the other 49 messages in one statement.
  await f.db.insert(messageEntityReferences).values(
    rows.slice(1).map((row) => ({
      organizationId: f.orgA,
      conversationId: conversation.id,
      messageId: row.id,
      entityId: project.entityId,
      entityType: "project" as const,
      purpose: "association" as const,
      createdByActorEntityId: f.alice,
    })),
  );
  const one = await reads([rows[0]!.id]);
  const page = await reads(rows.map((row) => row.id));
  expect(page.result.every((row) => row.links[0]?.title === "Launch")).toBe(true);
  expect(page.count).toBe(one.count);
  expect(page.count).toBe(3);
  queries.length = 0;
  expect((await service.messageLinks(rows[0]!.id))[0]?.title).toBe("Launch");
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(3);
  expect(await rejection(context("bob").messagePage([rows[0]!.id]))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(service.messagePage([rows[0]!.id, crypto.randomUUID()]))).toBeInstanceOf(
    AccessDeniedError,
  );
  const bob = createContextService(db, { userId: "bob", organizationId: f.orgA });
  const deniedReads = async (ids: string[]) => {
    queries.length = 0;
    expect(await rejection(bob.messagePage(ids))).toBeInstanceOf(AccessDeniedError);
    return queries.filter((query) => /^(select|with)/i.test(query)).length;
  };
  expect(await deniedReads(rows.map((row) => row.id))).toBe(await deniedReads([rows[0]!.id]));
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(2);
  expect(queries.some((query) => query.includes('from "message_entity_references"'))).toBe(false);
  const publicConversation = await chat.createConversation({
    kind: "channel",
    name: "Visible page row",
  });
  const visible = await chat.sendMessage(publicConversation.id, "Public message");
  expect(await rejection(bob.messagePage([visible.id, rows[0]!.id]))).toBeInstanceOf(
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
    (await checkedPage(ids))
      .flatMap((row) => row.links)
      .map((link) => [link.purpose, link.canRemove]),
  ).toEqual([
    ["source", false],
    ["mention", false],
    ["association", true],
    ["association", true],
  ]);
  expect(
    (await checkedPage(ids, "bob")).flatMap((row) => row.links).every((link) => !link.canRemove),
  ).toBe(true);
  expect(
    (await checkedPage(ids, "outsider", f.orgB)).every(
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
    (await checkedPage([root.id], "bob"))[0]!.links.find(
      (link) => link.entityId === project.entityId,
    )?.canRemove,
  ).toBe(true);
  expect(
    (await checkedPage([root.id]))[0]!.links.find((link) => link.entityId === project.entityId)
      ?.canRemove,
  ).toBe(true);
  await repos.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect((await checkedPage(ids, "bob")).every((row) => row.links.length === 0)).toBe(true);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, task.entityId));
  expect(
    (await checkedPage([root.id]))[0]!.links.filter((link) => link.entityId === task.entityId),
  ).toEqual([]);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, project.entityId));
  expect((await checkedPage(ids)).every((row) => row.links.length === 0)).toBe(true);
});

test("a task cannot be shared above its project, so removal rights match detach", async () => {
  const { chat, conversation, root, project, repos } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com"]);
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Linked" });
  await context().attach(root.id, task.entityId);
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(
    await rejection(
      repos.permissions.grant({ entityId: task.entityId, actorEntityId: f.bob, level: "owner" }),
    ),
  ).toBeInstanceOf(ValidationError);
  const [link] = (await checkedPage([root.id], "bob"))[0]!.links;
  expect(link).toMatchObject({ entityId: task.entityId, canRemove: false });
  expect(await rejection(context("bob").detach(root.id, task.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("page people resolve parsed tokens in sets and clear inactive, deleted and conversation-hidden actors", async () => {
  const { chat, conversation } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com", "outside@example.com"]);
  // People are parsed from the body when it is read.
  const rows = await insertMessages(
    conversation.id,
    Array.from({ length: 50 }, () => `@[person:${f.bob}]`),
  );
  const { db, queries, parameters } = recordQueries();
  const service = createContextService(db, { userId: "alice", organizationId: f.orgA });
  const one = await service.messagePage([rows[0]!.id]);
  const onePeopleParameters = parameters.at(-1)!.length;
  const count = queries.length;
  queries.length = 0;
  const page = await service.messagePage(rows.map((row) => row.id));
  expect(page.map((row) => row.people)).toEqual(rows.map(() => [{ id: f.bob, name: "Bob" }]));
  expect(parameters.at(-1)!).toHaveLength(onePeopleParameters);
  expect(one[0]!.people).toEqual([{ id: f.bob, name: "Bob" }]);
  expect(queries).toHaveLength(count);
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(4);
  queries.length = 0;
  await service.messageLinks(rows[0]!.id);
  expect(await service.messagePeople(rows[0]!.id)).toEqual([{ id: f.bob, name: "Bob" }]);
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(6);
  expect(
    (await context("outsider", f.orgB).messagePage(rows.map((row) => row.id))).every(
      (row) => row.people.length === 0 && row.links.length === 0,
    ),
  ).toBe(true);
  expect(
    (
      await checkedPage(
        rows.slice(0, 2).map((row) => row.id),
        "outsider",
        f.orgB,
      )
    ).every((row) => row.people.length === 0 && row.links.length === 0),
  ).toBe(true);
  await f.db
    .update(messagingMessages)
    .set({ body: `@[person:${f.bob}] @[person:${f.outsider}]` })
    .where(eq(messagingMessages.id, rows[0]!.id));
  expect((await checkedPage([rows[0]!.id]))[0]!.people).toEqual([{ id: f.bob, name: "Bob" }]);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
  expect((await checkedPage([rows[0]!.id]))[0]!.people).toEqual([]);
  await f.db.update(actors).set({ disabledAt: null }).where(eq(actors.entityId, f.bob));
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, f.bob));
  expect((await checkedPage([rows[0]!.id]))[0]!.people).toEqual([]);
  await f.db.update(entities).set({ deletedAt: null }).where(eq(entities.entityId, f.bob));
  await f.db.delete(messagingParticipants).where(eq(messagingParticipants.actorEntityId, f.bob));
  expect((await checkedPage([rows[0]!.id]))[0]!.people).toEqual([]);
  const publicConversation = await chat.createConversation({
    kind: "channel",
    name: "Public mentions",
  });
  const publicMention = await chat.sendMessage(publicConversation.id, `@[person:${f.bob}]`);
  expect((await checkedPage([rows[0]!.id, publicMention.id])).map((row) => row.people)).toEqual([
    [],
    [{ id: f.bob, name: "Bob" }],
  ]);
  expect(await rejection(context("bob").messagePage([rows[0]!.id]))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.delete(member).where(eq(member.userId, "bob"));
  expect((await checkedPage([publicMention.id]))[0]!.people).toEqual([]);
});

test("page context deduplicates requested IDs in order and keeps people tokens within each message and conversation", async () => {
  const { chat, conversation } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com"]);
  const bob = await chat.sendMessage(conversation.id, `@[person:${f.bob}] @[person:${f.bob}]`);
  const alice = await chat.sendMessage(conversation.id, `@[person:${f.alice}]`);
  const empty = await chat.sendMessage(conversation.id, "no tokens");
  const other = await chat.createConversation({
    kind: "channel",
    name: "Other private",
    private: true,
  });
  const hidden = await chat.sendMessage(other.id, "a previously visible person");
  await f.db
    .update(messagingMessages)
    .set({ body: `@[person:${f.bob}]` })
    .where(eq(messagingMessages.id, hidden.id));
  const result = await context().messagePage([hidden.id, alice.id, bob.id, alice.id, empty.id]);
  expect(result).toEqual([
    { messageId: hidden.id, links: [], people: [], messaging: [] },
    { messageId: alice.id, links: [], people: [{ id: f.alice, name: "Alice" }], messaging: [] },
    { messageId: bob.id, links: [], people: [{ id: f.bob, name: "Bob" }], messaging: [] },
    { messageId: empty.id, links: [], people: [], messaging: [] },
  ]);
});

test("single-purpose context matches page shapes and order with bounded reads as references grow", async () => {
  const { chat, conversation, root, project, repos } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com"]);
  await context().attach(root.id, project.entityId);
  await f.db
    .update(messagingMessages)
    .set({ body: `@[person:${f.bob}]` })
    .where(eq(messagingMessages.id, root.id));
  const { db, queries } = recordQueries();
  const service = createContextService(db, { userId: "alice", organizationId: f.orgA });
  const read = async () => {
    queries.length = 0;
    const links = await service.messageLinks(root.id);
    const linkQueries = queries.length;
    expect(queries.some((query) => query.includes('from "message_messaging_references"'))).toBe(
      false,
    );
    queries.length = 0;
    const people = await service.messagePeople(root.id);
    const peopleQueries = queries.length;
    expect(queries.some((query) => query.includes('from "message_entity_references"'))).toBe(false);
    const [page] = await service.messagePage([root.id]);
    expect(links).toEqual(page!.links);
    expect(people).toEqual(page!.people);
    return { links, people, linkQueries, peopleQueries };
  };
  const one = await read();
  const task = await repos.tasks.create({
    projectEntityId: project.entityId,
    title: "Second link",
  });
  await context().attach(root.id, task.entityId);
  await f.db
    .update(messagingMessages)
    .set({ body: `@[person:${f.bob}] @[person:${f.alice}] @[person:${f.bob}]` })
    .where(eq(messagingMessages.id, root.id));
  const many = await read();
  expect(many.links.map((link) => link.entityId)).toEqual([project.entityId, task.entityId]);
  expect(many.people).toEqual([
    { id: f.bob, name: "Bob" },
    { id: f.alice, name: "Alice" },
  ]);
  expect(many.linkQueries).toBe(one.linkQueries);
  expect(many.peopleQueries).toBe(one.peopleQueries);
  expect(many.linkQueries).toBeLessThanOrEqual(6);
  expect(many.peopleQueries).toBeLessThanOrEqual(6);
  await f.db
    .update(messagingMessages)
    .set({ body: "@[invalid-token" })
    .where(eq(messagingMessages.id, root.id));
  expect(await service.messageLinks(root.id)).toEqual(many.links);
});
