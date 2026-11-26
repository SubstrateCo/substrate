import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import { commit } from "../../../core/effects";
import { storedFiles } from "../../../core/storage/schema";
import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import { user, member } from "../../../schema";
import { setupDatabase } from "../../../testing/database";
import { recordQueries } from "../../../testing/queries";
import { rejection } from "../../../testing/rejection";
import { messagingMessages, messagingReactions } from "../schema";
import { createMessagingService } from "../service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();
const service = fixture.messaging;
const verified = fixture.verifyEmails;

test("send and replay reuse the authenticated identity", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const { db, queries } = recordQueries();
  const chat = createMessagingService(db, { userId: "alice", organizationId: fixture.orgA });
  const requestId = crypto.randomUUID();
  const sent = await chat.sendMessage(channel.id, "hello", undefined, requestId);
  expect(sent).toMatchObject({ authorName: "Alice", body: "hello", replyCount: 0, reactions: [] });
  const redundant = () => queries.filter((query) => query.startsWith('select "name" from "user"'));
  expect(redundant()).toEqual([]);
  // Includes the lookup for the author's own agents that the message may trigger, and the read for
  // people viewing the channel.
  expect(queries).toHaveLength(7);
  queries.length = 0;
  expect(await chat.sendMessage(channel.id, "hello", undefined, requestId)).toEqual(sent);
  expect(redundant()).toEqual([]);
  // Replay also reads the attachment set, so a changed set cannot reuse the request.
  expect(queries).toHaveLength(4);
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

test("concurrent sends with one request create one message and both return it", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "retry" });
  const requestId = crypto.randomUUID();
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  // The first send stays uncommitted, so the second passes the replay lookup and races the insert.
  const open = fixture.db.transaction(async (tx) => {
    const sent = await createMessagingService(tx, {
      userId: "alice",
      organizationId: fixture.orgA,
    }).sendMessage(channel.id, "hello", undefined, requestId);
    held.resolve();
    await release.promise;
    return sent;
  });
  await held.promise;
  const retry = service("alice").sendMessage(channel.id, "hello", undefined, requestId);
  const changed = rejection(
    service("alice").sendMessage(channel.id, "changed", undefined, requestId),
  );
  // Give both sends time to reach the uncommitted message's request ID.
  await Bun.sleep(100);
  release.resolve();
  const [first, second] = await Promise.all([open, retry]);
  expect(await changed).toBeInstanceOf(ConflictError);
  expect(second.id).toBe(first.id);
  const rows = await fixture.db
    .select({ id: messagingMessages.id })
    .from(messagingMessages)
    .where(eq(messagingMessages.requestId, requestId));
  expect(rows).toEqual([{ id: first.id }]);
});

test("message views show a request ID only to its author and omit internal columns", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "ids" });
  const requestId = crypto.randomUUID();
  const sent = await service("alice").sendMessage(channel.id, "hello", undefined, requestId);
  expect(sent.requestId).toBe(requestId);
  expect((await service("alice").listMessages(channel.id))[0]?.requestId).toBe(requestId);
  const [seen] = await service("bob").listMessages(channel.id);
  expect(seen).toMatchObject({ id: sent.id, requestId: null });
  for (const view of [sent, seen])
    for (const column of ["authorOrganizationId", "isRoot", "threadRoot"])
      expect(view).not.toHaveProperty(column);
});

test("send hints come from the write itself and describe only what the message changed", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const conversation = realtimeKeys.conversation(channel.id);
  const project = await fixture.forActor(fixture.alice).projects.create({ name: "Launch" });
  const { db, queries } = recordQueries();
  const send = (userId: string, body: string) =>
    commit(db, (tx) =>
      createMessagingService(tx, { userId, organizationId: fixture.orgA }).sendMessage(
        channel.id,
        body,
      ),
    );
  // A new message names itself and its thread, so viewers refresh only that history.
  const content = (sent: { result: { id: string; threadId: string | null } }): RealtimeHint => ({
    audience: conversation,
    domain: "messaging",
    scope: "messages",
    messageId: sent.result.id,
    threadId: sent.result.threadId,
  });
  const plain = await send("alice", "plain");
  expect(plain.hints).toEqual([content(plain)]);
  const reply = await commit(db, (tx) =>
    createMessagingService(tx, { userId: "alice", organizationId: fixture.orgA }).sendMessage(
      channel.id,
      "reply",
      plain.result.id,
    ),
  );
  expect(reply.hints).toEqual([
    {
      audience: conversation,
      domain: "messaging",
      scope: "messages",
      messageId: reply.result.id,
      threadId: plain.result.id,
    },
  ]);
  // Bob's first post joins the public channel.
  expect((await send("bob", "joining")).hints).toEqual([
    { audience: conversation, domain: "messaging" },
  ]);
  queries.length = 0;
  const mention = await send("alice", `@[person:${fixture.bob}]`);
  expect(mention.hints).toEqual(
    expect.arrayContaining([
      content(mention),
      { audience: realtimeKeys.actor(fixture.orgA, fixture.bob), domain: "notifications" as const },
    ]),
  );
  expect(mention.hints).toHaveLength(2);
  // The notification insert returns its recipients; nothing reads them back.
  expect(queries.filter((query) => /^select .* from "notifications"/i.test(query))).toEqual([]);
  const referenced = await send("alice", `@[project:${project.entityId}]`);
  // Only the project's readers hear that its related messages changed.
  expect(referenced.hints).toEqual([
    content(referenced),
    {
      audience: realtimeKeys.entity(fixture.orgA, project.entityId),
      domain: "context",
      projectId: project.entityId,
    },
  ]);
});

test("edits and deletions name the changed message and its thread", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const root = await service("alice").sendMessage(channel.id, "root");
  const reply = await service("alice").sendMessage(channel.id, "reply", root.id);
  const alice = (
    work: (chat: ReturnType<typeof createMessagingService>) => Promise<{ id: string }>,
  ) =>
    commit(fixture.db, (tx) =>
      work(createMessagingService(tx, { userId: "alice", organizationId: fixture.orgA })),
    );
  const changed = (messageId: string, threadId: string | null): RealtimeHint => ({
    audience: realtimeKeys.conversation(channel.id),
    domain: "messaging",
    messageId,
    threadId,
  });
  expect((await alice((chat) => chat.editMessage(reply.id, "edited"))).hints).toEqual([
    changed(reply.id, root.id),
  ]);
  expect((await alice((chat) => chat.deleteMessage(root.id))).hints).toEqual([
    changed(root.id, null),
  ]);
});

test("edits refresh related lists of the work referenced before and after, for its readers only", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const repos = fixture.forActor(fixture.alice);
  const before = await repos.projects.create({ name: "Before" });
  const after = await repos.projects.create({ name: "After" });
  const task = await repos.tasks.create({ projectEntityId: after.entityId, title: "Task" });
  const sent = await service("alice").sendMessage(channel.id, `@[project:${before.entityId}]`);
  const edited = await commit(fixture.db, (tx) =>
    createMessagingService(tx, { userId: "alice", organizationId: fixture.orgA }).editMessage(
      sent.id,
      `@[task:${task.entityId}]`,
    ),
  );
  expect(edited.hints).toEqual(
    expect.arrayContaining([
      {
        audience: realtimeKeys.entity(fixture.orgA, before.entityId),
        domain: "context",
        projectId: before.entityId,
      },
      {
        audience: realtimeKeys.entity(fixture.orgA, after.entityId),
        domain: "context",
        projectId: after.entityId,
        taskIds: [task.entityId],
      },
    ]),
  );
  // No hint names the work to the whole workspace.
  expect(
    edited.hints.filter((hint) => hint.audience[0] === "organization" && hint.domain === "context"),
  ).toEqual([]);
});

test("message pages load their summaries in one statement after scope resolution", async () => {
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
  expect(queries).toHaveLength(2);
  queries.length = 0;
  expect(await chat.listMessages(channel.id, first.id)).toMatchObject([
    { id: reply.id, replyCount: 0, reactions: [] },
  ]);
  expect(queries).toHaveLength(2);
  expect(queries[1]).not.toContain('from "messaging_messages" "page_reply"');
  queries.length = 0;
  expect(
    await chat.listMessages(channel.id, first.id, { aroundMessageId: reply.id }),
  ).toMatchObject([{ id: reply.id, replyCount: 0, reactions: [] }]);
  expect(queries).toHaveLength(2);
  queries.length = 0;
  expect(await chat.listMessages(channel.id, first.id, { beforeMessageId: reply.id })).toEqual([]);
  expect(queries).toHaveLength(2);
  queries.length = 0;
  expect(
    await chat.listMessages(channel.id, undefined, { beforeMessageId: second.id }),
  ).toMatchObject([
    { id: first.id, replyCount: 1, reactions: [{ emoji: "👍", count: 2, reacted: true }] },
  ]);
  expect(queries).toHaveLength(2);
  queries.length = 0;
  const empty = await service("alice").createConversation({ kind: "channel", name: "empty" });
  expect(await chat.listMessages(empty.id)).toEqual([]);
  expect(queries).toHaveLength(2);
});

test("page attachments, reactions and replies aggregate without multiplying each other", async () => {
  await verified();
  const chat = service("alice");
  const channel = await chat.createConversation({ kind: "channel", name: "attachments" });
  const files = await fixture.db
    .insert(storedFiles)
    .values(
      ["first.txt", "second.txt"].map((filename) => ({
        id: crypto.randomUUID(),
        organizationId: fixture.orgA,
        uploadedBy: "alice",
        purpose: "file",
        filename,
        contentType: "text/plain",
        size: 6,
        objectKey: crypto.randomUUID(),
        sha256: "a".repeat(64),
      })),
    )
    .returning();
  const root = await chat.sendMessage(
    channel.id,
    "root",
    undefined,
    undefined,
    files.map((file) => file.id),
  );
  await chat.toggleReaction(root.id, "👍");
  await service("bob").toggleReaction(root.id, "👍");
  await service("bob").toggleReaction(root.id, "🎉");
  await chat.sendMessage(channel.id, "one", root.id);
  const reply = await chat.sendMessage(channel.id, "two", root.id);
  await chat.deleteMessage(reply.id);
  const [view] = await chat.listMessages(channel.id);
  expect(view!.attachments).toEqual(root.attachments);
  expect(view!.replyCount).toBe(2);
  expect(view!.reactions).toHaveLength(2);
  expect(view!.reactions).toEqual(
    expect.arrayContaining([
      { emoji: "👍", count: 2, reacted: true },
      { emoji: "🎉", count: 1, reacted: false },
    ]),
  );
});

test("empty pages preserve access, thread and cursor validation", async () => {
  await verified();
  const chat = service("alice");
  const channel = await chat.createConversation({
    kind: "channel",
    name: "empty pages",
    private: true,
  });
  const root = await chat.sendMessage(channel.id, "root");
  expect(await chat.listMessages(channel.id, root.id)).toEqual([]);
  expect(await chat.listMessages(channel.id, undefined, { beforeMessageId: root.id })).toEqual([]);
  expect(await rejection(chat.listMessages(channel.id, crypto.randomUUID()))).toBeInstanceOf(
    ValidationError,
  );
  expect(
    await rejection(chat.listMessages(channel.id, root.id, { beforeMessageId: root.id })),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await rejection(service("bob").listMessages(channel.id, crypto.randomUUID())),
  ).toBeInstanceOf(AccessDeniedError);
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

test("a reaction to a reply names the reply's thread, so only that thread refreshes", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const root = await service("alice").sendMessage(channel.id, "root");
  const reply = await service("alice").sendMessage(channel.id, "reply", root.id);
  const reacted = await commit(fixture.db, (tx) =>
    createMessagingService(tx, { userId: "alice", organizationId: fixture.orgA }).toggleReaction(
      reply.id,
      "👍",
    ),
  );
  expect(reacted.hints).toEqual([
    {
      audience: realtimeKeys.conversation(channel.id),
      domain: "messaging",
      scope: "reactions",
      messageId: reply.id,
      threadId: root.id,
    },
  ]);
});

test("reactions aggregate per emoji, toggle per user and reject inaccessible messages", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const message = await service("alice").sendMessage(channel.id, "hello");
  // Only this message's reactions changed: no unread counts, order, or other conversations.
  const contentOnly: RealtimeHint[] = [
    {
      audience: realtimeKeys.conversation(channel.id),
      domain: "messaging",
      scope: "reactions",
      messageId: message.id,
      threadId: null,
    },
  ];
  const toggle = (userId: string) =>
    commit(fixture.db, (tx) =>
      createMessagingService(tx, { userId, organizationId: fixture.orgA }).toggleReaction(
        message.id,
        "👍",
      ),
    );
  expect(await toggle("alice")).toMatchObject({
    result: { active: true },
    hints: contentOnly,
  });
  // Bob's first reaction joins the public channel, so conversation lists must refresh too.
  expect((await toggle("bob")).hints).toEqual([
    { audience: realtimeKeys.conversation(channel.id), domain: "messaging" },
  ]);
  expect((await service("alice").listMessages(channel.id))[0]?.reactions).toEqual([
    { emoji: "👍", count: 2, reacted: true },
  ]);
  expect(await toggle("alice")).toMatchObject({
    result: { active: false },
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
