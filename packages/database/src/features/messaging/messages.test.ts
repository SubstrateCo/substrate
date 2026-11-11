import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { user, member } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { messagingMessages, messagingReactions } from "./schema";
import { createMessagingService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();
const service = fixture.messaging;
const verified = fixture.verifyEmails;

test("send and replay reuse authenticated identity and the locked conversation", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const { db, queries } = recordQueries();
  const chat = createMessagingService(db, { userId: "alice", organizationId: fixture.orgA });
  const requestId = crypto.randomUUID();
  const sent = await chat.sendMessage(channel.id, "hello", undefined, requestId);
  expect(sent).toMatchObject({ authorName: "Alice", body: "hello", replyCount: 0, reactions: [] });
  const redundant = () => queries.filter((query) => query.startsWith('select "name" from "user"'));
  const provisioning = () =>
    queries.filter((query) => query.includes('from "member"') && query.includes("for update"));
  expect(redundant()).toEqual([]);
  expect(provisioning()).toEqual([]);
  // Includes the lookup for the author's own agents that the message may trigger.
  expect(queries).toHaveLength(7);
  queries.length = 0;
  expect(await chat.sendMessage(channel.id, "hello", undefined, requestId)).toEqual(sent);
  expect(redundant()).toEqual([]);
  expect(provisioning()).toEqual([]);
  // Replay also reads the attachment set, so a changed set cannot reuse the request.
  expect(queries).toHaveLength(5);
  expect(
    await rejection(chat.sendMessage(channel.id, "changed", undefined, requestId)),
  ).toBeInstanceOf(ConflictError);
  expect(await rejection(chat.sendMessage(channel.id, "hello", sent.id, requestId))).toBeInstanceOf(
    ConflictError,
  );
  const other = await service("alice").createConversation({ kind: "channel", name: "other" });
  expect(await rejection(chat.sendMessage(other.id, "hello", undefined, requestId))).toBeInstanceOf(
    ConflictError,
  );
});

test("send hints come from the write itself and describe only what the message changed", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const conversation = realtimeKeys.conversation(channel.id);
  const project = await fixture.forActor(fixture.alice).projects.create({ name: "Launch" });
  const { db, queries } = recordQueries();
  const chat = (userId: string) =>
    createMessagingService(db, { userId, organizationId: fixture.orgA });
  const plain = await chat("alice").sendMessage(channel.id, "plain");
  expect(plain.hints).toEqual([{ audience: conversation, domain: "messaging", scope: "messages" }]);
  // Bob's first post joins the public channel.
  expect((await chat("bob").sendMessage(channel.id, "joining")).hints).toEqual([
    { audience: conversation, domain: "messaging" },
  ]);
  queries.length = 0;
  const mention = await chat("alice").sendMessage(channel.id, `@[person:${fixture.bob}]`);
  expect(mention.hints).toEqual([
    { audience: conversation, domain: "messaging", scope: "messages" },
    { audience: realtimeKeys.actor(fixture.orgA, fixture.bob), domain: "notifications" },
  ]);
  // The notification insert returns its recipients; nothing reads them back.
  expect(queries.filter((query) => /^select .* from "notifications"/i.test(query))).toEqual([]);
  expect(
    (await chat("alice").sendMessage(channel.id, `@[project:${project.entityId}]`)).hints,
  ).toEqual([
    { audience: conversation, domain: "messaging", scope: "messages" },
    { audience: realtimeKeys.organization(fixture.orgA), domain: "context" },
  ]);
});

test("reaction summaries stay message-local and replies skip the root count query", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const first = await service("alice").sendMessage(channel.id, "first");
  const second = await service("alice").sendMessage(channel.id, "second");
  const reply = await service("bob").sendMessage(channel.id, "reply", first.id);
  await service("alice").toggleReaction(first.id, "👍");
  await service("bob").toggleReaction(first.id, "👍");
  await service("bob").toggleReaction(second.id, "🎉");
  const { db, queries } = recordQueries();
  const chat = createMessagingService(db, { userId: "alice", organizationId: fixture.orgA });
  expect(await chat.listMessages(channel.id)).toMatchObject([
    { id: first.id, replyCount: 1, reactions: [{ emoji: "👍", count: 2, reacted: true }] },
    { id: second.id, replyCount: 0, reactions: [{ emoji: "🎉", count: 1, reacted: false }] },
  ]);
  queries.length = 0;
  expect(await chat.listMessages(channel.id, first.id)).toMatchObject([
    { id: reply.id, replyCount: 0, reactions: [] },
  ]);
  expect(
    queries.filter(
      (query) => query.includes("count(*)") && query.includes('from "messaging_messages"'),
    ),
  ).toEqual([]);
  queries.length = 0;
  const empty = await service("alice").createConversation({ kind: "channel", name: "empty" });
  expect(await chat.listMessages(empty.id)).toEqual([]);
  expect(
    queries.filter(
      (query) => query.includes("count(*)") && query.includes('from "messaging_messages"'),
    ),
  ).toEqual([]);
});

test("external authors follow the viewer organization for partner channel roots and replies", async () => {
  await verified();
  await fixture.db.update(user).set({ name: "Alice" }).where(eq(user.id, "outsider"));
  const channel = await service("alice").createConversation({
    kind: "channel",
    name: "partners",
    private: true,
    emails: ["outside@example.com"],
  });
  const internalRoot = await service("alice").sendMessage(channel.id, "Internal root");
  const externalRoot = await service("outsider", fixture.orgB).sendMessage(
    channel.id,
    "Partner root",
  );
  const internalReply = await service("alice").sendMessage(
    channel.id,
    "Internal reply",
    internalRoot.id,
  );
  const externalReply = await service("outsider", fixture.orgB).sendMessage(
    channel.id,
    "Partner reply",
    internalRoot.id,
  );
  for (const [viewer, organizationId, aliceExternal, outsiderExternal] of [
    ["alice", fixture.orgA, false, true],
    ["outsider", fixture.orgB, true, false],
  ] as const) {
    expect(await service(viewer, organizationId).listMessages(channel.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: internalRoot.id, authorExternal: aliceExternal }),
        expect.objectContaining({ id: externalRoot.id, authorExternal: outsiderExternal }),
      ]),
    );
    expect(await service(viewer, organizationId).listMessages(channel.id, internalRoot.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: internalReply.id, authorExternal: aliceExternal }),
        expect.objectContaining({ id: externalReply.id, authorExternal: outsiderExternal }),
      ]),
    );
  }
  expect(await rejection(service("bob").listMessages(channel.id))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("external authors use current membership, not participant organization or author identity", async () => {
  await verified();
  const channel = await service("alice").createConversation({
    kind: "channel",
    name: "partners",
    emails: ["outside@example.com"],
  });
  const root = await service("outsider", fixture.orgB).sendMessage(channel.id, "Partner root");
  const reply = await service("outsider", fixture.orgB).sendMessage(
    channel.id,
    "Partner reply",
    root.id,
  );
  const assertExternal = async (authorExternal: boolean) => {
    expect(await service("alice").listMessages(channel.id)).toMatchObject([
      { id: root.id, authorExternal },
    ]);
    expect(await service("alice").listMessages(channel.id, root.id)).toMatchObject([
      { id: reply.id, authorExternal },
    ]);
  };
  await assertExternal(true);
  await fixture.db.insert(member).values({
    id: "outsider-a",
    userId: "outsider",
    organizationId: fixture.orgA,
  });
  await assertExternal(false);
  await fixture.db.delete(member).where(eq(member.id, "outsider-a"));
  await assertExternal(true);
});

test("threads stay in their conversation and reference only roots, including raw SQL constraints", async () => {
  await verified();
  const a = await service("alice").createConversation({ kind: "channel", name: "a" });
  const b = await service("alice").createConversation({ kind: "channel", name: "b" });
  const root = await service("alice").sendMessage(a.id, "root");
  const reply = await service("alice").sendMessage(a.id, "reply", root.id);
  expect(await service("alice").listMessages(a.id)).toMatchObject([{ id: root.id, replyCount: 1 }]);
  expect(await service("alice").listMessages(a.id, root.id)).toMatchObject([
    { id: reply.id, threadId: root.id },
  ]);
  expect(
    await rejection(service("alice").sendMessage(b.id, "wrong conversation", root.id)),
  ).toBeInstanceOf(ValidationError);
  expect(await rejection(service("alice").sendMessage(a.id, "nested", reply.id))).toBeInstanceOf(
    ValidationError,
  );
  expect(
    await rejection(
      fixture.db
        .insert(messagingMessages)
        .values({
          conversationId: b.id,
          authorActorEntityId: fixture.alice,
          authorOrganizationId: fixture.orgA,
          body: "bad",
          threadId: root.id,
        })
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
  expect(
    await rejection(
      fixture.db
        .insert(messagingMessages)
        .values({
          conversationId: a.id,
          authorActorEntityId: fixture.alice,
          authorOrganizationId: fixture.orgA,
          body: "bad",
          threadId: reply.id,
        })
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
  expect(
    await rejection(
      fixture.db
        .insert(messagingMessages)
        .values({
          conversationId: a.id,
          authorActorEntityId: fixture.outsider,
          authorOrganizationId: fixture.orgB,
          body: "bad",
        })
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
});

test("reactions aggregate per emoji, toggle per user and reject inaccessible messages", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const message = await service("alice").sendMessage(channel.id, "hello");
  const contentOnly: RealtimeHint[] = [
    { audience: realtimeKeys.conversation(channel.id), domain: "messaging", scope: "messages" },
  ];
  expect(await service("alice").toggleReaction(message.id, "👍")).toEqual({
    active: true,
    hints: contentOnly,
  });
  // Bob's first reaction joins the public channel, so conversation lists must refresh too.
  expect((await service("bob").toggleReaction(message.id, "👍")).hints).toEqual([
    { audience: realtimeKeys.conversation(channel.id), domain: "messaging" },
  ]);
  expect((await service("alice").listMessages(channel.id))[0]?.reactions).toEqual([
    { emoji: "👍", count: 2, reacted: true },
  ]);
  expect(await service("alice").toggleReaction(message.id, "👍")).toEqual({
    active: false,
    hints: contentOnly,
  });
  expect((await service("alice").listMessages(channel.id))[0]?.reactions).toEqual([
    { emoji: "👍", count: 1, reacted: false },
  ]);
  expect(
    await rejection(service("outsider", fixture.orgB).toggleReaction(message.id, "👍")),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(
      fixture.db
        .insert(messagingReactions)
        .values({
          conversationId: crypto.randomUUID(),
          messageId: message.id,
          actorEntityId: fixture.alice,
          emoji: "👍",
        })
        .execute(),
    ),
  ).toMatchObject({ cause: { code: "23503" } });
});

test("posts, reactions and reads do not wait for an open post, while leaving waits for it", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "busy" });
  const root = await service("bob").sendMessage(channel.id, "joined");
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const open = fixture.db.transaction(async (tx) => {
    await createMessagingService(tx, { userId: "alice", organizationId: fixture.orgA }).sendMessage(
      channel.id,
      "open",
    );
    held.resolve();
    await release.promise;
  });
  try {
    await held.promise;
    const within = <T>(work: Promise<T>) =>
      Promise.race([work.then(() => "done"), Bun.sleep(1_000).then(() => "blocked")]);
    expect(await within(service("bob").sendMessage(channel.id, "second"))).toBe("done");
    expect(await within(service("bob").toggleReaction(root.id, "👍"))).toBe("done");
    expect(await within(service("bob").listMessages(channel.id))).toBe("done");
    let left = false;
    const leaving = service("bob")
      .leaveConversation(channel.id)
      .then(() => {
        left = true;
      });
    await Bun.sleep(200);
    expect(left).toBe(false);
    release.resolve();
    await Promise.all([open, leaving]);
    expect(left).toBe(true);
  } finally {
    release.resolve();
    await open;
  }
});

test("concurrent toggles serialize and leave no duplicate reactions", async () => {
  await verified();
  const channel = await service("alice").createConversation({
    kind: "channel",
    name: "concurrent",
  });
  const message = await service("alice").sendMessage(channel.id, "toggle");
  const results = await Promise.all([
    service("alice").toggleReaction(message.id, "👍"),
    service("alice").toggleReaction(message.id, "👍"),
  ]);
  expect(results.map((result) => result.active).sort((a, b) => Number(a) - Number(b))).toEqual([
    false,
    true,
  ]);
  expect((await service("alice").listMessages(channel.id))[0]?.reactions).toEqual([]);
});
