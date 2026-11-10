import { ensureHumanActor, ensureUserAgentActor } from "../../core/actors/provisioning";
import { RepositoryContext } from "../../core/repository-context";
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
  userAgents,
} from "../../schema";
import { setupDatabase } from "../../testing/database";
import {
  approveFixtureParticipants,
  createAcceptedMessagingService,
} from "../../testing/messaging";
import { recordQueries } from "../../testing/queries";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../messaging/schema";
import { applyMessageEffects } from "./message-effects";
import { messageEntityReferences, sourceTaskRequests } from "./schema";
import { createContextService } from "./service";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const context = (userId = "alice", organizationId = f.orgA) =>
  createContextService(f.db, { userId, organizationId });

async function checkedPage(messageIds: string[], userId = "alice", organizationId = f.orgA) {
  const service = context(userId, organizationId);
  const page = await service.messagePage(messageIds);
  for (const row of page) {
    expect(await service.messageLinks(row.messageId)).toEqual(row.links);
    expect(await service.messagePeople(row.messageId)).toEqual(row.people);
  }
  return page;
}

test("five person mentions and five task references resolve in set-based statements", async () => {
  const people = ["one", "two", "three", "four"];
  await f.db
    .insert(user)
    .values(people.map((id) => ({ id, name: id, email: `${id}@example.com` })));
  await f.db
    .insert(member)
    .values(people.map((id) => ({ id: `${id}-a`, userId: id, organizationId: f.orgA })));
  await f.db.update(user).set({ emailVerified: true });
  const mentioned = [f.bob];
  for (const id of people)
    mentioned.push(
      (await ensureHumanActor(f.db, { userId: id, organizationId: f.orgA, name: id })).entityId,
    );
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Referenced" });
  const taskIds: string[] = [];
  for (let index = 0; index < 5; index++)
    taskIds.push(
      (await alice.tasks.create({ projectEntityId: project.entityId, title: `Task ${index}` }))
        .entityId,
    );
  const channel = await createAcceptedMessagingService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
  }).createConversation({ kind: "channel", name: "References" });
  const { db, queries } = recordQueries();
  const body = [
    ...mentioned.map((id) => `@[person:${id}]`),
    ...taskIds.map((id) => `@[task:${id}]`),
  ].join(" ");
  const sent = await createAcceptedMessagingService(db, {
    userId: "alice",
    organizationId: f.orgA,
  }).sendMessage(channel.id, body);
  // Includes the lookup for the author's own agents that the message may trigger.
  expect(queries).toHaveLength(10);
  expect(
    (
      await f.db
        .select()
        .from(messageEntityReferences)
        .where(eq(messageEntityReferences.messageId, sent.id))
    )
      .map((row) => row.entityId)
      .sort(),
  ).toEqual(taskIds.sort());
  expect(
    (await f.db.select().from(notifications).where(eq(notifications.messageId, sent.id)))
      .map((row) => `${row.recipientActorEntityId}:${row.kind}`)
      .sort(),
  ).toEqual(mentioned.map((id) => `${id}:mention`).sort());
});

test("notification recipients use one conflict-safe insert-select for one or many workspaces, with exact participant workspace selection", async () => {
  await f.db.update(user).set({ emailVerified: true });
  await f.db.insert(member).values([
    { id: "bob-b", userId: "bob", organizationId: f.orgB },
    { id: "outside-a", userId: "outsider", organizationId: f.orgA },
  ]);
  const bobB = await ensureHumanActor(f.db, {
    userId: "bob",
    organizationId: f.orgB,
    name: "Bob B",
  });
  const outsiderA = await ensureHumanActor(f.db, {
    userId: "outsider",
    organizationId: f.orgA,
    name: "Outside A",
  });
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({ kind: "channel", name: "Public" });
  const root = await chat.sendMessage(channel.id, "root");
  await createAcceptedMessagingService(f.db, { userId: "bob", organizationId: f.orgA }).sendMessage(
    channel.id,
    "bob",
    root.id,
  );
  const { db, queries } = recordQueries();
  const sender = createAcceptedMessagingService(db, { userId: "alice", organizationId: f.orgA });
  const send = async () => {
    queries.length = 0;
    const sent = await sender.sendMessage(channel.id, "reply", root.id, crypto.randomUUID());
    const authors = queries.findIndex((query) =>
      query.includes('"author_id" from "messaging_messages"'),
    );
    return {
      sent,
      // The agent-trigger lookup is not part of notification delivery.
      reads: queries
        .slice(authors + 1)
        .filter((query) => /^\s*(select|with)/i.test(query) && !query.includes('"user_agents"'))
        .length,
      inserts: queries.filter((query) => /^\s*insert into "notifications"/i.test(query)).length,
    };
  };
  const one = await send();
  expect(one.reads).toBe(0);
  expect(one.inserts).toBe(1);
  expect(
    (await f.db.select().from(notifications).where(eq(notifications.messageId, one.sent.id))).map(
      (row) => row.recipientActorEntityId,
    ),
  ).toEqual([f.bob]);
  await createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgA,
  }).sendMessage(channel.id, "outsider", root.id);
  // A partner membership alone must not receive notifications outside the home workspace.
  await f.db.insert(messagingParticipants).values({
    conversationId: channel.id,
    organizationId: f.orgB,
    actorEntityId: bobB.entityId,
    actorType: "human",
  });
  await approveFixtureParticipants(f.db, channel.id);
  await createAcceptedMessagingService(f.db, { userId: "bob", organizationId: f.orgB }).sendMessage(
    channel.id,
    "bob in B",
    root.id,
  );
  const many = await send();
  expect(many.reads).toBe(0);
  expect(many.inserts).toBe(1);
  expect(
    (await f.db.select().from(notifications).where(eq(notifications.messageId, many.sent.id)))
      .map((row) => row.recipientActorEntityId)
      .sort(),
  ).toEqual([f.bob, bobB.entityId, outsiderA.entityId].sort());
  const requestId = crypto.randomUUID();
  const mentioned = await sender.sendMessage(
    channel.id,
    `@[person:${f.bob}] @[person:${f.bob}]`,
    root.id,
    requestId,
  );
  await sender.sendMessage(channel.id, `@[person:${f.bob}] @[person:${f.bob}]`, root.id, requestId);
  const notices = await f.db
    .select()
    .from(notifications)
    .where(eq(notifications.messageId, mentioned.id));
  expect(notices.map((row) => `${row.recipientActorEntityId}:${row.kind}`).sort()).toEqual(
    [`${f.bob}:mention`, `${bobB.entityId}:mention`, `${outsiderA.entityId}:reply`].sort(),
  );
  await f.db.transaction((tx) =>
    applyMessageEffects(
      new RepositoryContext(tx, { organizationId: f.orgA, actorEntityId: f.alice }),
      { userId: "alice", organizationId: f.orgA },
      mentioned,
      f.orgA,
    ),
  );
  expect(
    await f.db.select().from(notifications).where(eq(notifications.messageId, mentioned.id)),
  ).toEqual(notices);
  await f.db
    .update(messagingConversations)
    .set({ private: true })
    .where(eq(messagingConversations.id, channel.id));
  // Bob keeps only his workspace B membership.
  await f.db
    .update(messagingParticipants)
    .set({ leftAt: new Date() })
    .where(eq(messagingParticipants.actorEntityId, f.bob));
  const privateReply = await send();
  expect(
    (
      await f.db
        .select()
        .from(notifications)
        .where(eq(notifications.messageId, privateReply.sent.id))
    )
      .map((row) => row.recipientActorEntityId)
      .sort(),
  ).toEqual([bobB.entityId, outsiderA.entityId].sort());
});

for (const invalid of ["disabled", "deleted", "unverified", "removed", "hidden"] as const) {
  test(`reply notifications exclude currently ${invalid} actors and invalid mentions roll back`, async () => {
    await f.db.update(user).set({ emailVerified: true });
    const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
    const channel = await chat.createConversation({
      kind: "channel",
      name: "Private",
      private: true,
      emails: ["bob@example.com"],
    });
    const root = await createAcceptedMessagingService(f.db, {
      userId: "bob",
      organizationId: f.orgA,
    }).sendMessage(channel.id, "root");
    if (invalid === "disabled")
      await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
    if (invalid === "deleted")
      await f.db
        .update(entities)
        .set({ deletedAt: new Date() })
        .where(eq(entities.entityId, f.bob));
    if (invalid === "unverified")
      await f.db.update(user).set({ emailVerified: false }).where(eq(user.id, "bob"));
    if (invalid === "removed") await f.db.delete(member).where(eq(member.userId, "bob"));
    if (invalid === "hidden")
      await f.db
        .update(messagingParticipants)
        .set({ leftAt: new Date() })
        .where(eq(messagingParticipants.actorEntityId, f.bob));
    const reply = await chat.sendMessage(channel.id, "reply", root.id);
    expect(
      await f.db.select().from(notifications).where(eq(notifications.messageId, reply.id)),
    ).toEqual([]);
    if (invalid !== "unverified") {
      const before = await chat.listMessages(channel.id);
      await expect(
        chat.sendMessage(channel.id, `@[person:${f.bob}]`, root.id),
      ).rejects.toBeInstanceOf(AccessDeniedError);
      expect(await chat.listMessages(channel.id)).toEqual(before);
    } else {
      const mention = await chat.sendMessage(channel.id, `@[person:${f.bob}]`, root.id);
      expect(
        await f.db.select().from(notifications).where(eq(notifications.messageId, mention.id)),
      ).toEqual([]);
    }
  });
}

test("message, references and batched notifications all roll back with the caller transaction", async () => {
  const { chat, conversation, project } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com", "outside@example.com"]);
  const before = await chat.listMessages(conversation.id);
  await expect(
    f.db.transaction(async (tx) => {
      await createAcceptedMessagingService(tx, {
        userId: "alice",
        organizationId: f.orgA,
      }).sendMessage(
        conversation.id,
        `@[project:${project.entityId}] @[person:${f.bob}]`,
        before[0]!.id,
      );
      throw new Error("abort after batch");
    }),
  ).rejects.toThrow("abort after batch");
  expect(await chat.listMessages(conversation.id)).toEqual(before);
  expect(await f.db.select().from(messageEntityReferences)).toEqual([]);
  expect(await f.db.select().from(notifications)).toEqual([]);
  for (const id of [crypto.randomUUID(), f.outsider]) {
    await expect(chat.sendMessage(conversation.id, `@[person:${id}]`)).rejects.toBeInstanceOf(
      AccessDeniedError,
    );
  }
  expect(await chat.listMessages(conversation.id)).toEqual(before);
});

test("thread recipients use one distinct conversation-scoped query and mentions take precedence", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({
    kind: "channel",
    name: "discussion",
    emails: ["bob@example.com", "outside@example.com"],
  });
  const root = await chat.sendMessage(channel.id, "root");
  const bob = createAcceptedMessagingService(f.db, { userId: "bob", organizationId: f.orgA });
  for (let i = 0; i < 5; i++) await bob.sendMessage(channel.id, `reply ${i}`, root.id);
  const { db, queries } = recordQueries();
  const partner = createAcceptedMessagingService(db, {
    userId: "outsider",
    organizationId: f.orgB,
  });
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
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
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
  expect(emptyPage.count).toBe(3);
  queries.length = 0;
  for (const row of rows) await service.messageLinks(row.id);
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(150);
  for (const row of rows) await context().attach(row.id, project.entityId);
  const one = await reads([rows[0]!.id]);
  const page = await reads(rows.map((row) => row.id));
  expect(page.result.every((row) => row.links[0]?.title === "Launch")).toBe(true);
  expect(page.count).toBe(one.count);
  expect(page.count).toBe(3);
  queries.length = 0;
  for (const row of rows) await service.messageLinks(row.id);
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(150);
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
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(2);
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

test("a task grant never raises task access above the project, so removal rights match detach", async () => {
  const { chat, conversation, root, project, repos } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com"]);
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Linked" });
  await context().attach(root.id, task.entityId);
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  await repos.permissions.grant({ entityId: task.entityId, actorEntityId: f.bob, level: "owner" });
  const [link] = (await checkedPage([root.id], "bob"))[0]!.links;
  expect(link).toMatchObject({ entityId: task.entityId, canRemove: false });
  await expect(context("bob").detach(root.id, task.entityId)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});

test("page people resolve parsed tokens in sets and clear inactive, deleted and conversation-hidden actors", async () => {
  const { chat, conversation } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com", "outside@example.com"]);
  const rows = [];
  for (let i = 0; i < 50; i++)
    rows.push(await chat.sendMessage(conversation.id, `@[person:${f.bob}]`));
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
  for (const row of rows) {
    await service.messageLinks(row.id);
    await service.messagePeople(row.id);
  }
  expect(queries.filter((query) => /^(select|with)/i.test(query))).toHaveLength(300);
  expect(
    (
      await checkedPage(
        rows.map((row) => row.id),
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
  await expect(context("bob").messagePage([rows[0]!.id])).rejects.toBeInstanceOf(AccessDeniedError);
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
  const { db, queries } = recordQueries();
  await createContextService(db, { userId: "alice", organizationId: f.orgA }).createTaskFromMessage(
    { ...input, requestId: crypto.randomUUID() },
  );
  // The project lock taken for idempotency also covers the task insert.
  expect(queries.filter((query) => query.includes("FOR UPDATE"))).toHaveLength(1);
  expect(queries).toHaveLength(13);
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
  await f.db.delete(messagingParticipants).where(eq(messagingParticipants.actorEntityId, f.bob));
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

test("message targets retain timeline reaction and reply summaries for roots and replies", async () => {
  const { chat, reply, root, conversation } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com"]);
  const bob = createAcceptedMessagingService(f.db, { userId: "bob", organizationId: f.orgA });
  await chat.toggleReaction(root.id, "👍");
  await bob.toggleReaction(root.id, "👍");
  await bob.toggleReaction(reply.id, "🎉");
  const [timelineRoot] = await chat.listMessages(conversation.id);
  const [timelineReply] = await chat.listMessages(conversation.id, root.id);
  expect(timelineRoot).toMatchObject({
    replyCount: 1,
    reactions: [{ emoji: "👍", count: 2, reacted: true }],
  });
  expect(timelineReply).toMatchObject({
    replyCount: 0,
    reactions: [{ emoji: "🎉", count: 1, reacted: false }],
  });
  const { db, queries } = recordQueries();
  const target = createContextService(db, { userId: "alice", organizationId: f.orgA });
  for (const message of [timelineRoot!, timelineReply!]) {
    queries.length = 0;
    expect(await target.messageTarget(conversation.id, message.id)).toEqual({
      message,
      root: timelineRoot!,
    });
    expect(queries.filter((query) => query.includes('from "messaging_reactions"'))).toHaveLength(1);
    expect(
      queries.filter(
        (query) => query.includes('from "messaging_messages"') && query.includes("count(*)"),
      ),
    ).toHaveLength(1);
    // Workspace context, message with root and authors, then the two summary reads.
    expect(queries).toHaveLength(4);
  }
  await chat.toggleReaction(root.id, "👍");
  await bob.sendMessage(conversation.id, "Another reply", root.id);
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    root: { replyCount: 2, reactions: [{ emoji: "👍", count: 1, reacted: false }] },
    message: { replyCount: 0, reactions: [{ emoji: "🎉", count: 1, reacted: false }] },
  });
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

test("related discussions use current human names for local and partner authors", async () => {
  const { chat, conversation, root, project } = await setup();
  await chat.addMembers(conversation.id, ["outside@example.com"]);
  const reply = await createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  }).sendMessage(conversation.id, "Partner reply", root.id);
  await context().attach(root.id, project.entityId);
  await context().attach(reply.id, project.entityId);
  await f.db.update(user).set({ name: "Alice renamed" }).where(eq(user.id, "alice"));
  await f.db.update(user).set({ name: "Partner renamed" }).where(eq(user.id, "outsider"));
  expect(
    (await context().related(project.entityId)).map((row) => ({
      messageId: row.messageId,
      authorName: row.authorName,
      authorType: row.authorType,
    })),
  ).toEqual([
    { messageId: root.id, authorName: "Alice renamed", authorType: "human" },
    { messageId: reply.id, authorName: "Partner renamed", authorType: "human" },
  ]);
});

test("message targets use current human names for the root and partner reply", async () => {
  const { chat, conversation, root } = await setup();
  await chat.addMembers(conversation.id, ["outside@example.com"]);
  const reply = await createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  }).sendMessage(conversation.id, "Partner reply", root.id);
  await f.db.update(user).set({ name: "Alice renamed" }).where(eq(user.id, "alice"));
  await f.db.update(user).set({ name: "Partner renamed" }).where(eq(user.id, "outsider"));
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    root: { id: root.id, authorName: "Alice renamed", authorType: "human", authorExternal: false },
    message: {
      id: reply.id,
      authorName: "Partner renamed",
      authorType: "human",
      authorExternal: true,
    },
  });
});

test("related discussions and message targets retain agent attribution after owner rename", async () => {
  const { chat, project } = await setup();
  const [agent] = await f.db
    .insert(userAgents)
    .values({
      userId: "alice",
      name: "Research",
      instructions: "",
      harness: "opencode",
    })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: agent!.id,
  });
  const conversation = await chat.createConversation({ kind: "channel", name: "Agent discussion" });
  const agentChat = createAcceptedMessagingService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    actorEntityId: actor.entityId,
  });
  const root = await agentChat.sendMessage(conversation.id, "Agent root");
  const reply = await agentChat.sendMessage(conversation.id, "Agent reply", root.id);
  await context().attach(root.id, project.entityId);
  await context().attach(reply.id, project.entityId);
  await f.db.update(user).set({ name: "Alice renamed" }).where(eq(user.id, "alice"));
  const attribution = { authorName: "Research", authorType: "agent" };
  expect(await context().related(project.entityId)).toMatchObject([
    { messageId: root.id, ...attribution },
    { messageId: reply.id, ...attribution },
  ]);
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    root: { id: root.id, ...attribution, authorExternal: false },
    message: { id: reply.id, ...attribution, authorExternal: false },
  });
});

test("linked message targets classify root and reply authors by current viewer membership", async () => {
  const { chat, conversation, root } = await setup();
  await chat.addMembers(conversation.id, ["outside@example.com"]);
  const partner = createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  });
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
