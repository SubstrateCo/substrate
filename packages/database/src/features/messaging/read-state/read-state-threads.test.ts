import { commit } from "../../../core/effects";
import { AccessDeniedError } from "../../../errors";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { notifications } from "../../notifications/schema";
import { createMessagingService } from "../service";
import { expect, test } from "bun:test";
import { and, eq, isNull } from "drizzle-orm";

const f = setupDatabase();
const reads = () => createMessagingService(f.db, { userId: "bob", organizationId: f.orgA });
const mark = (
  conversationId: string,
  messageId: string,
  options?: { threadId?: string; viewing?: boolean },
) =>
  commit(f.db, (tx) =>
    createMessagingService(tx, { userId: "bob", organizationId: f.orgA }).markRead(
      conversationId,
      messageId,
      options,
    ),
  );
const unreadNotices = async () =>
  new Set(
    (
      await f.db
        .select({ messageId: notifications.messageId })
        .from(notifications)
        .where(and(eq(notifications.recipientActorEntityId, f.bob), isNull(notifications.readAt)))
    ).map((row) => row.messageId),
  );

test("the timeline and each thread are read separately, with their notices", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  const dm = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const first = await alice.sendMessage(dm.id, "first topic");
  const second = await alice.sendMessage(dm.id, "second topic");
  const firstReply = await alice.sendMessage(dm.id, "on the first", first.id);
  const secondReply = await alice.sendMessage(dm.id, "on the second", second.id);
  const latest = await alice.sendMessage(dm.id, "latest");
  await mark(dm.id, latest.id);
  expect(await reads().unreadCounts()).toEqual([
    {
      conversationId: dm.id,
      unreadCount: 2,
      mentionCount: 0,
      firstUnreadMessageId: null,
      unreadReplyThreadIds: [first.id, second.id],
    },
  ]);
  expect(await unreadNotices()).toEqual(new Set([firstReply.id, secondReply.id]));
  await mark(dm.id, firstReply.id);
  expect(await reads().unreadCounts()).toMatchObject([
    { unreadCount: 1, unreadReplyThreadIds: [second.id] },
  ]);
  expect(await unreadNotices()).toEqual(new Set([secondReply.id]));
  await mark(dm.id, second.id, { threadId: second.id });
  expect(await reads().unreadCounts()).toMatchObject([{ unreadReplyThreadIds: [second.id] }]);
  expect(await rejection(mark(dm.id, firstReply.id, { threadId: second.id }))).toBeInstanceOf(
    AccessDeniedError,
  );
  await mark(dm.id, secondReply.id);
  expect(await reads().unreadCounts()).toEqual([]);
  expect(await unreadNotices()).toEqual(new Set());
});

test("outside direct messages, replies count only in threads the reader follows", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  const channel = await alice.createConversation({ kind: "channel", name: "Launch" });
  await f.messaging("bob").joinConversation(channel.id);
  const root = await alice.sendMessage(channel.id, "plan");
  await mark(channel.id, root.id);
  await alice.sendMessage(channel.id, "a detail", root.id);
  expect(await reads().unreadCounts()).toEqual([]);
  const mention = await alice.sendMessage(channel.id, `@[person:${f.bob}] thoughts?`, root.id);
  expect(await reads().unreadCounts()).toEqual([
    {
      conversationId: channel.id,
      unreadCount: 2,
      mentionCount: 1,
      firstUnreadMessageId: null,
      unreadReplyThreadIds: [root.id, root.id],
    },
  ]);
  await mark(channel.id, mention.id);
  const own = await f.messaging("bob").sendMessage(channel.id, "my question");
  await alice.sendMessage(channel.id, "an answer", own.id);
  expect(await reads().unreadCounts()).toMatchObject([
    { unreadCount: 1, unreadReplyThreadIds: [own.id] },
  ]);
});
