import { ensureHumanActor } from "../../core/actors/provisioning";
import { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { entities, user, member, notifications, actors } from "../../schema";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import {
  approveFixtureParticipants,
  createAcceptedMessagingService,
} from "../../testing/messaging";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../messaging/schema";
import { applyMessageEffects } from "./message-effects";
import { messageEntityReferences } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const setup = () => contextConversation(f);

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
    mentioned.push((await ensureHumanActor(f.db, { userId: id, organizationId: f.orgA })).entityId);
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
  const sender = createAcceptedMessagingService(db, { userId: "alice", organizationId: f.orgA });
  await sender.sendMessage(channel.id, `@[person:${mentioned[0]}] @[task:${taskIds[0]}]`);
  const single = queries.length;
  queries.length = 0;
  const body = [
    ...mentioned.map((id) => `@[person:${id}]`),
    ...taskIds.map((id) => `@[task:${id}]`),
  ].join(" ");
  const sent = await sender.sendMessage(channel.id, body);
  // Five of each cost what one of each costs. Includes the lookup for the author's own agents.
  expect(queries).toHaveLength(single);
  expect(queries).toHaveLength(9);
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
  });
  const outsiderA = await ensureHumanActor(f.db, {
    userId: "outsider",
    organizationId: f.orgA,
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
      query.includes('"user_id" from "messaging_messages"'),
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
  const [stored] = await f.db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, mentioned.id));
  await f.db.transaction((tx) =>
    applyMessageEffects(
      new RepositoryContext(tx, { organizationId: f.orgA, actorEntityId: f.alice }),
      { userId: "alice", organizationId: f.orgA },
      stored!,
      channel,
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
      expect(
        await rejection(chat.sendMessage(channel.id, `@[person:${f.bob}]`, root.id)),
      ).toBeInstanceOf(AccessDeniedError);
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
  expect(
    await rejection(
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
    ),
  ).toMatchObject({ message: expect.stringContaining("abort after batch") });
  expect(await chat.listMessages(conversation.id)).toEqual(before);
  expect(await f.db.select().from(messageEntityReferences)).toEqual([]);
  expect(await f.db.select().from(notifications)).toEqual([]);
  for (const id of [crypto.randomUUID(), f.outsider]) {
    expect(await rejection(chat.sendMessage(conversation.id, `@[person:${id}]`))).toBeInstanceOf(
      AccessDeniedError,
    );
  }
  expect(await chat.listMessages(conversation.id)).toEqual(before);
});

test("mention, reply and message alerts share one insert-select, and mentions win", async () => {
  await f.db.insert(user).values({ id: "one", name: "one", email: "one@example.com" });
  await f.db.insert(member).values({ id: "one-a", userId: "one", organizationId: f.orgA });
  await f.db.update(user).set({ emailVerified: true });
  const one = await ensureHumanActor(f.db, { userId: "one", organizationId: f.orgA });
  const chat = createAcceptedMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const group = await chat.createConversation({
    kind: "group",
    emails: ["bob@example.com", "one@example.com", "outside@example.com"],
  });
  const root = await createAcceptedMessagingService(f.db, {
    userId: "bob",
    organizationId: f.orgA,
  }).sendMessage(group.id, "root");
  await createAcceptedMessagingService(f.db, { userId: "one", organizationId: f.orgA }).sendMessage(
    group.id,
    "one replied",
    root.id,
  );
  const { db, queries } = recordQueries();
  const sender = createAcceptedMessagingService(db, { userId: "alice", organizationId: f.orgA });
  const sent = await sender.sendMessage(group.id, `@[person:${one.entityId}]`, root.id);
  expect(
    queries.filter((query) => /^\s*select distinct "actors"\."organization_id"/i.test(query)),
  ).toEqual([]);
  expect(
    queries.filter((query) => /^\s*insert into "notifications".*\bselect\b/is.test(query)),
  ).toHaveLength(1);
  // One authored a thread reply and was mentioned; the mention takes precedence.
  expect(
    (await f.db.select().from(notifications).where(eq(notifications.messageId, sent.id)))
      .map((row) => `${row.recipientActorEntityId}:${row.organizationId}:${row.kind}`)
      .sort(),
  ).toEqual(
    [
      `${one.entityId}:${f.orgA}:mention`,
      `${f.bob}:${f.orgA}:reply`,
      `${f.outsider}:${f.orgB}:message`,
    ].sort(),
  );
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
    queries.filter((query) => query.includes('"user_id" from "messaging_messages"')),
  ).toHaveLength(1);
  // Bob replied five times and is notified once.
  expect(
    (await f.db.select().from(notifications).where(eq(notifications.messageId, sent.id)))
      .map((row) => `${row.recipientActorEntityId}:${row.organizationId}:${row.kind}`)
      .sort(),
  ).toEqual([`${f.alice}:${f.orgA}:reply`, `${f.bob}:${f.orgA}:reply`].sort());
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
