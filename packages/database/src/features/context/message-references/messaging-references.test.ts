import { user } from "../../../core/authentication/schema";
import { AccessDeniedError } from "../../../errors";
import { setupDatabase } from "../../../testing/database";
import { createAcceptedMessagingService } from "../../../testing/messaging";
import { rejection } from "../../../testing/rejection";
import {
  messagingConversations,
  messagingMessages,
  messagingParticipants,
} from "../../messaging/schema";
import { notifications } from "../../notifications/schema";
import { createContextService } from "../service";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();
const scope = { userId: "alice", organizationId: f.orgA };

test("hashtag search returns channels and distinct threads, not DMs or standalone messages", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const chat = createAcceptedMessagingService(f.db, scope);
  const channel = await chat.createConversation({ kind: "channel", name: "Launch" });
  const dm = await chat.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  await chat.sendMessage(channel.id, "Standalone Launch");
  const root = await chat.sendMessage(channel.id, "Checklist");
  await chat.sendMessage(channel.id, "Launch reply one", root.id);
  await chat.sendMessage(channel.id, "Launch reply two", root.id);
  const dmRoot = await chat.sendMessage(dm.id, "Launch DM");
  await chat.sendMessage(dm.id, "Launch DM reply", dmRoot.id);
  const context = createContextService(f.db, scope);
  expect((await context.search({ kind: "channel", query: "Launch" })).map((row) => row.id)).toEqual(
    [channel.id],
  );
  expect(await context.search({ kind: "thread", query: "Launch" })).toMatchObject([
    {
      id: root.id,
      kind: "thread",
      title: "Checklist",
      conversationId: channel.id,
      threadId: root.id,
      conversationName: "Launch",
    },
  ]);
});

test("references are checked on send, resolve with live access, and expose safe related records", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const chat = createAcceptedMessagingService(f.db, scope);
  const source = await chat.createConversation({ kind: "channel", name: "Source" });
  const target = await chat.createConversation({
    kind: "channel",
    name: "Private target",
    private: true,
  });
  const root = await chat.sendMessage(target.id, "Target thread");
  await chat.sendMessage(target.id, "Reply", root.id);
  const body = `See @[channel:${target.id}] @[thread:${root.id}] @[channel:${target.id}]`;
  const sent = await chat.sendMessage(source.id, body);
  expect(
    await f.db.select().from(notifications).where(eq(notifications.messageId, sent.id)),
  ).toEqual([]);
  const context = createContextService(f.db, scope);
  expect((await context.messagePage([sent.id]))[0]?.messaging).toMatchObject([
    { id: target.id, kind: "channel", title: "Private target" },
    { id: root.id, kind: "thread", title: "Target thread" },
  ]);
  expect(
    (await context.search({ query: "", relatedToEntityId: sent.id })).map((row) => row.id),
  ).toEqual(expect.arrayContaining([target.id, root.id]));
  const bob = createContextService(f.db, { userId: "bob", organizationId: f.orgA });
  expect((await bob.messagePage([sent.id]))[0]?.messaging).toEqual([]);
  expect(await rejection(bob.search({ query: "", relatedToEntityId: root.id }))).toBeInstanceOf(
    AccessDeniedError,
  );
  const before = await f.db.select().from(messagingMessages);
  expect(
    await rejection(
      createAcceptedMessagingService(f.db, { userId: "bob", organizationId: f.orgA }).sendMessage(
        source.id,
        body,
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(messagingMessages)).toEqual(before);
  // Preserve authorship history while revoking visibility in this workspace.
  await f.db
    .update(messagingParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(messagingParticipants.conversationId, target.id),
        eq(messagingParticipants.actorEntityId, f.alice),
      ),
    );
  expect((await context.messagePage([sent.id]))[0]?.messaging).toEqual([]);
});

test("invalid target kinds, reply targets, and cross-workspace references roll back", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const chat = createAcceptedMessagingService(f.db, scope);
  const source = await chat.createConversation({ kind: "channel", name: "Source" });
  const root = await chat.sendMessage(source.id, "Root");
  const reply = await chat.sendMessage(source.id, "Reply", root.id);
  const dm = await chat.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const foreign = await createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  }).createConversation({ kind: "channel", name: "Foreign" });
  const before = await f.db.select().from(messagingMessages);
  for (const body of [
    `@[channel:${dm.id}]`,
    `@[thread:${reply.id}]`,
    `@[channel:${foreign.id}]`,
    `@[channel:${source.id}] @[thread:${crypto.randomUUID()}]`,
  ])
    expect(await rejection(chat.sendMessage(source.id, body))).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(messagingMessages)).toEqual(before);
});

test("shared foreign source conversations cannot suggest or save local hashtag references", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const foreignChat = createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  });
  const shared = await foreignChat.createConversation({
    kind: "channel",
    name: "Shared",
    private: true,
    emails: ["alice@example.com"],
  });
  const chat = createAcceptedMessagingService(f.db, scope);
  const local = await chat.createConversation({ kind: "channel", name: "Local" });
  const context = createContextService(f.db, scope);
  for (const kind of ["channel", "thread"] as const) {
    expect(await context.search({ query: "", kind, conversationId: shared.id })).toEqual([]);
  }
  expect(await rejection(chat.sendMessage(shared.id, `@[channel:${local.id}]`))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await chat.listMessages(shared.id)).toEqual([]);
});

test("channel renames resolve live labels and removed thread targets lose their derived relationships", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const chat = createAcceptedMessagingService(f.db, scope);
  const source = await chat.createConversation({ kind: "channel", name: "Source" });
  const target = await chat.createConversation({ kind: "channel", name: "Original" });
  const root = await chat.sendMessage(target.id, "Thread");
  const reply = await chat.sendMessage(target.id, "Reply", root.id);
  const sent = await chat.sendMessage(source.id, `@[channel:${target.id}] @[thread:${root.id}]`);
  await f.db
    .update(messagingConversations)
    .set({ name: "Renamed" })
    .where(eq(messagingConversations.id, target.id));
  const context = createContextService(f.db, scope);
  expect((await context.messagePage([sent.id]))[0]?.messaging).toMatchObject([
    { id: target.id, kind: "channel", title: "Renamed" },
    { id: root.id, kind: "thread", conversationName: "Renamed" },
  ]);
  await f.db.delete(messagingMessages).where(eq(messagingMessages.id, reply.id));
  await f.db.delete(messagingMessages).where(eq(messagingMessages.id, root.id));
  expect((await context.messagePage([sent.id]))[0]?.messaging.map((item) => item.kind)).toEqual([
    "channel",
  ]);
});
