import { user } from "../../core/authentication/schema";
import { AccessDeniedError } from "../../errors";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { messagingMessages } from "./schema";
import { createMessagingService } from "./service";
import { expect, test } from "bun:test";

const f = setupDatabase();
test("message windows paginate equal timestamps without gaps and reject anchors from another conversation", async () => {
  await f.db.update(user).set({ emailVerified: true });
  const service = createMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const conversation = await service.createConversation({ kind: "channel", name: "History" });
  const date = new Date("2026-11-05T12:00:00Z");
  const inserted = await f.db
    .insert(messagingMessages)
    .values(
      Array.from({ length: 65 }, (_, index) => ({
        conversationId: conversation.id,
        authorActorEntityId: f.alice,
        authorOrganizationId: f.orgA,
        body: `Message ${index}`,
        createdAt: date,
      })),
    )
    .returning();
  inserted.sort((a, b) => a.id.localeCompare(b.id));
  const firstRoot = inserted[0]!;
  const lastRoot = inserted.at(-1)!;
  await service.sendMessage(conversation.id, "Old root reply", firstRoot.id);
  await service.sendMessage(conversation.id, "New root reply one", lastRoot.id);
  await service.sendMessage(conversation.id, "New root reply two", lastRoot.id);
  const newest = await service.listMessages(conversation.id);
  const oldest = await service.listMessages(conversation.id, undefined, {
    beforeMessageId: newest[0]!.id,
  });
  expect(newest).toHaveLength(50);
  expect(oldest).toHaveLength(15);
  expect(oldest.find((message) => message.id === firstRoot.id)?.replyCount).toBe(1);
  expect(newest.find((message) => message.id === lastRoot.id)?.replyCount).toBe(2);
  expect(
    newest
      .filter((message) => message.id !== lastRoot.id)
      .every((message) => message.replyCount === 0),
  ).toBe(true);
  const replies = await service.listMessages(conversation.id, lastRoot.id);
  expect(replies.map((message) => message.body)).toEqual([
    "New root reply one",
    "New root reply two",
  ]);
  expect(replies.every((message) => message.replyCount === 0)).toBe(true);
  expect(new Set([...newest, ...oldest].map((message) => message.id))).toEqual(
    new Set(inserted.map((message) => message.id)),
  );
  const anchor = newest[10]!;
  const around = await service.listMessages(conversation.id, undefined, {
    aroundMessageId: anchor.id,
  });
  expect(around.at(-1)!.id).toBe(anchor.id);
  const other = await service.createConversation({ kind: "channel", name: "Other" });
  expect(
    await rejection(service.listMessages(other.id, undefined, { beforeMessageId: anchor.id })),
  ).toBeInstanceOf(AccessDeniedError);
});
