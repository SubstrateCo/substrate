import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { user, member, entityGrants, actors } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
  messagingReactions,
} from "./schema";
import { createMessagingService } from "./service";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const fixture = setupDatabase();
const service = (userId: string, organizationId = fixture.orgA) =>
  createMessagingService(fixture.db, { userId, organizationId });
async function verified() {
  await fixture.db.update(user).set({ emailVerified: true });
}

test("send and replay reuse authenticated identity and the locked conversation", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const { db, queries } = recordQueries();
  const chat = createMessagingService(db, { userId: "alice", organizationId: fixture.orgA });
  const requestId = crypto.randomUUID();
  const sent = await chat.sendMessage(channel.id, "hello", undefined, requestId);
  expect(sent).toMatchObject({ authorName: "Alice", body: "hello", replyCount: 0, reactions: [] });
  const redundant = () =>
    queries.filter(
      (query) =>
        query.startsWith('select "name" from "user"') ||
        (query.includes('from "messaging_conversations"') && !query.includes("for update")),
    );
  const provisioning = () =>
    queries.filter((query) => query.includes('from "member"') && query.includes("for update"));
  expect(redundant()).toEqual([]);
  expect(provisioning()).toEqual([]);
  expect(queries).toHaveLength(5);
  queries.length = 0;
  expect(await chat.sendMessage(channel.id, "hello", undefined, requestId)).toEqual(sent);
  expect(redundant()).toEqual([]);
  expect(provisioning()).toEqual([]);
  expect(queries).toHaveLength(3);
  await expect(
    chat.sendMessage(channel.id, "changed", undefined, requestId),
  ).rejects.toBeInstanceOf(ConflictError);
  await expect(chat.sendMessage(channel.id, "hello", sent.id, requestId)).rejects.toBeInstanceOf(
    ConflictError,
  );
  const other = await service("alice").createConversation({ kind: "channel", name: "other" });
  await expect(chat.sendMessage(other.id, "hello", undefined, requestId)).rejects.toBeInstanceOf(
    ConflictError,
  );
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
  await expect(service("bob").listMessages(channel.id)).rejects.toBeInstanceOf(AccessDeniedError);
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

test("cross-org DMs use explicit participants without adding entity grants", async () => {
  await verified();
  const before = await fixture.db.select().from(entityGrants);
  const dm = await service("alice").createConversation({
    kind: "dm",
    emails: ["outside@example.com"],
  });
  const sent = await service("alice").sendMessage(dm.id, "Across organizations");
  expect(
    (await service("outsider", fixture.orgB).listConversations()).map((row) => row.id),
  ).toEqual([dm.id]);
  expect(await service("outsider", fixture.orgB).listMessages(dm.id)).toMatchObject([
    { id: sent.id, authorName: "Alice", body: "Across organizations" },
  ]);
  await expect(service("bob").listMessages(dm.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(service("outsider", fixture.orgA).listConversations()).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await fixture.db.select().from(entityGrants)).toEqual(before);
});

test("public channels are org-scoped, private channels need membership, only creator adds members", async () => {
  await verified();
  const publicChannel = await service("alice").createConversation({
    kind: "channel",
    name: "general",
  });
  const privateChannel = await service("alice").createConversation({
    kind: "channel",
    name: "private",
    private: true,
  });
  expect((await service("bob").listConversations()).map((row) => row.id)).toEqual([
    publicChannel.id,
  ]);
  expect(await service("outsider", fixture.orgB).listConversations()).toEqual([]);
  await expect(
    service("outsider", fixture.orgB).sendMessage(publicChannel.id, "no"),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(service("bob").sendMessage(privateChannel.id, "no")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await service("bob").sendMessage(publicChannel.id, "joined");
  await expect(
    service("bob").addMembers(publicChannel.id, ["outside@example.com"]),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await service("alice").addMembers(privateChannel.id, ["outside@example.com"]);
  expect(
    (await service("outsider", fixture.orgB).listConversations()).map((row) => row.id),
  ).toEqual([privateChannel.id]);
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
  await expect(
    service("alice").sendMessage(b.id, "wrong conversation", root.id),
  ).rejects.toBeInstanceOf(ValidationError);
  await expect(service("alice").sendMessage(a.id, "nested", reply.id)).rejects.toBeInstanceOf(
    ValidationError,
  );
  await expect(
    fixture.db
      .insert(messagingMessages)
      .values({ conversationId: b.id, authorId: "alice", body: "bad", threadId: root.id })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    fixture.db
      .insert(messagingMessages)
      .values({ conversationId: a.id, authorId: "alice", body: "bad", threadId: reply.id })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
  await expect(
    fixture.db
      .insert(messagingMessages)
      .values({ conversationId: a.id, authorId: "outsider", body: "bad" })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

test("reactions aggregate per emoji, toggle per user and reject inaccessible messages", async () => {
  await verified();
  const channel = await service("alice").createConversation({ kind: "channel", name: "general" });
  const message = await service("alice").sendMessage(channel.id, "hello");
  expect(await service("alice").toggleReaction(message.id, "👍")).toEqual({ active: true });
  await service("bob").toggleReaction(message.id, "👍");
  expect((await service("alice").listMessages(channel.id))[0]?.reactions).toEqual([
    { emoji: "👍", count: 2, reacted: true },
  ]);
  expect(await service("alice").toggleReaction(message.id, "👍")).toEqual({ active: false });
  expect((await service("alice").listMessages(channel.id))[0]?.reactions).toEqual([
    { emoji: "👍", count: 1, reacted: false },
  ]);
  await expect(
    service("outsider", fixture.orgB).toggleReaction(message.id, "👍"),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    fixture.db
      .insert(messagingReactions)
      .values({
        conversationId: crypto.randomUUID(),
        messageId: message.id,
        userId: "alice",
        emoji: "👍",
      })
      .execute(),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});

test("exact email discovery requires verified accounts and org membership; invalid recipients roll back", async () => {
  await verified();
  await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "bob"));
  expect(await service("alice").discoverMembers("bob@example.com")).toEqual([]);
  await expect(service("alice").discoverMembers("outside")).rejects.toBeInstanceOf(ValidationError);
  expect(await service("alice").discoverMembers(" OUTSIDE@example.com ")).toMatchObject([
    { userId: "outsider" },
  ]);
  await expect(
    service("alice").createConversation({
      kind: "group",
      emails: ["outside@example.com", "bob@example.com"],
    }),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
  expect(await fixture.db.select().from(messagingParticipants)).toEqual([]);
  await fixture.db.delete(member).where(eq(member.userId, "outsider"));
  expect(await service("alice").discoverMembers("outside@example.com")).toEqual([]);
});

test("group DMs support multiple recipients and caller transactions roll back all records", async () => {
  await verified();
  await expect(
    fixture.db.transaction(async (tx) => {
      const group = await createMessagingService(tx, {
        userId: "alice",
        organizationId: fixture.orgA,
      }).createConversation({ kind: "group", emails: ["bob@example.com", "outside@example.com"] });
      await createMessagingService(tx, {
        userId: "alice",
        organizationId: fixture.orgA,
      }).sendMessage(group.id, "rollback");
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
  expect(await fixture.db.select().from(messagingMessages)).toEqual([]);
  const group = await service("alice").createConversation({
    kind: "group",
    emails: ["bob@example.com", "outside@example.com"],
  });
  expect(
    (await service("outsider", fixture.orgB).listMembers(group.id)).map((row) => row.userId).sort(),
  ).toEqual(["alice", "bob", "outsider"]);
});

test("participant access is bound to the recipient organization and departure preserves history but revokes access", async () => {
  await verified();
  await fixture.db
    .insert(member)
    .values({ id: "bob-b", userId: "bob", organizationId: fixture.orgB });
  const dm = await service("alice").createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const channel = await service("alice").createConversation({
    kind: "channel",
    name: "restricted",
    private: true,
    emails: ["bob@example.com"],
  });
  const sent = await service("bob").sendMessage(dm.id, "retain my history");
  expect((await service("bob").listConversations()).map((row) => row.id).sort()).toEqual(
    [dm.id, channel.id].sort(),
  );
  expect(await service("bob", fixture.orgB).listConversations()).toEqual([]);
  await expect(service("bob", fixture.orgB).listMessages(dm.id)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await expect(
    service("bob", fixture.orgB).sendMessage(channel.id, "wrong scope"),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await fixture.db.delete(member).where(eq(member.id, "bob-a"));
  await expect(service("bob").listConversations()).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await service("bob", fixture.orgB).listConversations()).toEqual([]);
  await expect(service("bob", fixture.orgB).toggleReaction(sent.id, "👍")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await service("alice").listMessages(dm.id)).toMatchObject([
    { id: sent.id, body: "retain my history" },
  ]);
});

test("unnamed DMs and groups have participant display names", async () => {
  await verified();
  const dm = await service("alice").createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const group = await service("alice").createConversation({
    kind: "group",
    emails: ["bob@example.com", "outside@example.com"],
  });
  expect(await service("alice").listConversations()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: dm.id, name: "Bob" }),
      expect.objectContaining({ id: group.id, name: "Bob, Outsider" }),
    ]),
  );
  expect(await service("bob").listConversations()).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: dm.id, name: "Alice" })]),
  );
});

test("disabled actors and unverified callers cannot use messaging", async () => {
  await verified();
  await fixture.db
    .update(actors)
    .set({ disabledAt: new Date() })
    .where(eq(actors.entityId, fixture.bob));
  await expect(service("bob").listConversations()).rejects.toBeInstanceOf(AccessDeniedError);
  await fixture.db.update(user).set({ emailVerified: false }).where(eq(user.id, "alice"));
  await expect(
    service("alice").createConversation({ kind: "channel", name: "blocked" }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await fixture.db.select().from(messagingConversations)).toEqual([]);
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
