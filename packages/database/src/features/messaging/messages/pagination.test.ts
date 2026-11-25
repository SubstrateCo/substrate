import { user } from "../../../core/authentication/schema";
import { AccessDeniedError } from "../../../errors";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { messagingMessages } from "../schema";
import { createMessagingService } from "../service";
import { expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const f = setupDatabase();

test("message cursors preserve PostgreSQL microseconds without rereading the anchor", async () => {
  await f.verifyEmails();
  const service = f.messaging("alice");
  const conversation = await service.createConversation({ kind: "channel", name: "Precise" });
  const first = await service.sendMessage(conversation.id, "first");
  const second = await service.sendMessage(conversation.id, "second");
  await f.db
    .update(messagingMessages)
    .set({ createdAt: sql`'2026-01-01T00:00:00.000001Z'::timestamptz` })
    .where(eq(messagingMessages.id, first.id));
  await f.db
    .update(messagingMessages)
    .set({ createdAt: sql`'2026-01-01T00:00:00.000002Z'::timestamptz` })
    .where(eq(messagingMessages.id, second.id));
  expect(
    (await service.listMessages(conversation.id, undefined, { beforeMessageId: second.id })).map(
      (row) => row.id,
    ),
  ).toEqual([first.id]);
});
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
  expect(
    await rejection(service.listMessages(other.id, undefined, { afterMessageId: anchor.id })),
  ).toBeInstanceOf(AccessDeniedError);
});

test("an after cursor returns only newer messages of its thread, oldest first", async () => {
  await f.verifyEmails();
  const service = f.messaging("alice");
  const conversation = await service.createConversation({ kind: "channel", name: "Delta" });
  const first = await service.sendMessage(conversation.id, "first");
  const second = await service.sendMessage(conversation.id, "second");
  await service.sendMessage(conversation.id, "reply", first.id);
  const third = await service.sendMessage(conversation.id, "third");
  const after = (afterMessageId: string, threadId?: string) =>
    service.listMessages(conversation.id, threadId, { afterMessageId });
  expect((await after(first.id)).map((row) => row.id)).toEqual([second.id, third.id]);
  expect(await after(third.id)).toEqual([]);
  // A timeline message is not a cursor inside a thread.
  expect(await rejection(after(second.id, first.id))).toBeInstanceOf(AccessDeniedError);
});

test("an after cursor beyond one page returns the newest page, which marks a gap", async () => {
  await f.verifyEmails();
  const service = f.messaging("alice");
  const conversation = await service.createConversation({ kind: "channel", name: "Gap" });
  const anchor = await service.sendMessage(conversation.id, "anchor");
  const later = await f.db
    .insert(messagingMessages)
    .values(
      Array.from({ length: 55 }, (_, index) => ({
        conversationId: conversation.id,
        authorActorEntityId: f.alice,
        authorOrganizationId: f.orgA,
        body: `Later ${index}`,
        createdAt: new Date(Date.now() + 1_000 + index * 1_000),
      })),
    )
    .returning();
  const rows = await service.listMessages(conversation.id, undefined, {
    afterMessageId: anchor.id,
  });
  expect(rows).toHaveLength(50);
  expect(rows.map((row) => row.body)).toEqual(later.slice(5).map((row) => row.body));
});
