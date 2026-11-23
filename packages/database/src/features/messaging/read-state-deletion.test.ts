import { setupDatabase } from "../../testing/database";
import { createMessagingService } from "./service";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("deleting an unread message removes its unread count", async () => {
  await f.verifyEmails();
  const alice = f.messaging("alice");
  const conversation = await alice.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const sent = await alice.sendMessage(conversation.id, "unread");
  const read = createMessagingService(f.db, { organizationId: f.orgA, userId: "bob" });
  expect(await read.unreadCounts()).toEqual([
    {
      conversationId: conversation.id,
      unreadCount: 1,
      mentionCount: 0,
      firstUnreadMessageId: sent.id,
    },
  ]);
  await alice.deleteMessage(sent.id);
  expect(await read.unreadCounts()).toEqual([]);
});
