/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { setupDatabase } from "../../testing/database";
import { user } from "../../core/authentication/schema";
import { AccessDeniedError } from "../../errors";
import { createMessagingService } from "./service";
import { messagingMessages } from "./schema";

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
        authorId: "alice",
        body: `Message ${index}`,
        createdAt: date,
      })),
    )
    .returning();
  const newest = await service.listMessages(conversation.id);
  const oldest = await service.listMessages(conversation.id, undefined, {
    beforeMessageId: newest[0]!.id,
  });
  expect(newest).toHaveLength(50);
  expect(oldest).toHaveLength(15);
  expect(new Set([...newest, ...oldest].map((message) => message.id))).toEqual(
    new Set(inserted.map((message) => message.id)),
  );
  const anchor = newest[10]!;
  const around = await service.listMessages(conversation.id, undefined, {
    aroundMessageId: anchor.id,
  });
  expect(around.at(-1)!.id).toBe(anchor.id);
  const other = await service.createConversation({ kind: "channel", name: "Other" });
  await expect(
    service.listMessages(other.id, undefined, { beforeMessageId: anchor.id }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});
