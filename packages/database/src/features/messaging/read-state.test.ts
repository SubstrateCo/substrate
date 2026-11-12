import { commit } from "../../core/effects";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { readOperations } from "./read-state";
import { messagingMessages, messagingParticipants } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const reads = (userId = "bob", organizationId = f.orgA) =>
  readOperations(f.db, { userId, organizationId });
const mark = (conversationId: string, messageId: string) =>
  commit(f.db, (tx) =>
    readOperations(tx, { userId: "bob", organizationId: f.orgA }).markRead(
      conversationId,
      messageId,
    ),
  );

test("read positions persist, exclude own messages, and never move backwards", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  const conversation = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const first = await alice.sendMessage(conversation.id, "first");
  await f.messaging("bob").sendMessage(conversation.id, "own");
  const last = await alice.sendMessage(conversation.id, "last");
  expect(await reads().unreadCounts()).toEqual([
    { conversationId: conversation.id, unreadCount: 2 },
  ]);
  await mark(conversation.id, last.id);
  await mark(conversation.id, first.id);
  expect(await reads().unreadCounts()).toEqual([]);
  await alice.sendMessage(conversation.id, "new");
  expect(await reads().unreadCounts()).toEqual([
    { conversationId: conversation.id, unreadCount: 1 },
  ]);
});

test("a message at the read position's time counts when it sorts after the read message", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  const conversation = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const sent = [
    await alice.sendMessage(conversation.id, "one"),
    await alice.sendMessage(conversation.id, "two"),
  ].sort((a, b) => (a.id < b.id ? -1 : 1));
  const at = new Date("2026-01-01T00:00:00Z");
  await f.db
    .update(messagingMessages)
    .set({ createdAt: at })
    .where(eq(messagingMessages.conversationId, conversation.id));
  await mark(conversation.id, sent[0]!.id);
  expect(await reads().unreadCounts()).toEqual([
    { conversationId: conversation.id, unreadCount: 1 },
  ]);
});

test("unread counts and read mutations enforce conversation and organization access", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  const privateChat = await alice.createConversation({
    kind: "channel",
    name: "Private",
    private: true,
  });
  const hidden = await alice.sendMessage(privateChat.id, "hidden");
  expect(await reads().unreadCounts()).toEqual([]);
  expect(await rejection(mark(privateChat.id, hidden.id))).toBeInstanceOf(AccessDeniedError);
  const dm = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const visible = await alice.sendMessage(dm.id, "visible");
  expect(await rejection(mark(dm.id, hidden.id))).toBeInstanceOf(AccessDeniedError);
  expect(await reads("outsider", f.orgB).unreadCounts()).toEqual([]);
  await mark(dm.id, visible.id);
  await f.db
    .update(messagingParticipants)
    .set({ leftAt: new Date() })
    .where(eq(messagingParticipants.actorEntityId, f.bob));
  expect(await reads().unreadCounts()).toEqual([]);
  expect(await rejection(mark(dm.id, visible.id))).toBeInstanceOf(AccessDeniedError);
});
