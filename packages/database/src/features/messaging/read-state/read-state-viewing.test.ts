import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import { commit } from "../../../core/effects";
import { setupDatabase } from "../../../testing/database";
import { recordQueries } from "../../../testing/queries";
import { notifications } from "../../notifications/schema";
import { createMessagingService } from "../service";
import { messagingReadPositions } from "./read-state.schema";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

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
const send = (conversationId: string, body: string, threadId?: string) =>
  commit(f.db, (tx) =>
    createMessagingService(tx, { userId: "alice", organizationId: f.orgA }).sendMessage(
      conversationId,
      body,
      threadId,
    ),
  );
const alertFor = (organizationId: string, actorId: string): RealtimeHint => ({
  audience: realtimeKeys.actor(organizationId, actorId),
  domain: "notifications",
});
const bobAlert = () => alertFor(f.orgA, f.bob);
const noticeFor = async (messageId: string, recipient: string) => {
  const [notice] = await f.db
    .select({ readAt: notifications.readAt })
    .from(notifications)
    .where(
      and(
        eq(notifications.messageId, messageId),
        eq(notifications.recipientActorEntityId, recipient),
      ),
    );
  return notice;
};

test("a reader viewing the timeline reads new messages as they arrive, without an alert", async () => {
  await f.verifyEmails();
  const group = await f
    .messaging("alice")
    .createConversation({ kind: "group", emails: ["bob@example.com", "outside@example.com"] });
  const first = (await send(group.id, "first")).result;
  await mark(group.id, first.id, { viewing: true });
  const seen = await send(group.id, "while Bob looks");
  // Bob's notice is kept, read, and nothing alerts him. The other member is still alerted.
  expect(seen.hints).not.toContainEqual(bobAlert());
  expect((await noticeFor(seen.result.id, f.bob))?.readAt).toBeInstanceOf(Date);
  expect(seen.hints).toContainEqual(alertFor(f.orgB, f.outsider));
  expect(await noticeFor(seen.result.id, f.outsider)).toEqual({ readAt: null });
  expect(await reads().unreadCounts()).toEqual([]);
  // Viewing the timeline does not cover its threads.
  await f.messaging("bob").sendMessage(group.id, "joining the thread", first.id);
  const reply = await send(group.id, "in the thread", first.id);
  expect(reply.hints).toContainEqual(bobAlert());
  expect(await reads().unreadCounts()).toMatchObject([{ unreadReplyThreadIds: [first.id] }]);
  // Ending the lease, or letting it lapse, makes new messages unread again.
  await mark(group.id, seen.result.id, { viewing: false });
  const afterLeaving = await send(group.id, "after Bob left");
  expect(afterLeaving.hints).toContainEqual(bobAlert());
  await mark(group.id, afterLeaving.result.id, { viewing: true });
  await f.db
    .update(messagingReadPositions)
    .set({ viewingUntil: new Date(Date.now() - 1000) })
    .where(eq(messagingReadPositions.actorEntityId, f.bob));
  const afterLapse = await send(group.id, "after the lease lapsed");
  expect(afterLapse.hints).toContainEqual(bobAlert());
  expect(await reads().unreadCounts()).toMatchObject([
    { firstUnreadMessageId: afterLapse.result.id },
  ]);
});

test("a reader viewing a thread reads its replies as they arrive, not the timeline", async () => {
  await f.verifyEmails();
  const dm = await f
    .messaging("alice")
    .createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const root = (await send(dm.id, "root")).result;
  await mark(dm.id, root.id);
  await mark(dm.id, root.id, { threadId: root.id, viewing: true });
  const reply = await send(dm.id, "reply", root.id);
  expect(reply.hints).not.toContainEqual(bobAlert());
  expect(await reads().unreadCounts()).toEqual([]);
  const elsewhere = await send(dm.id, "in the timeline");
  expect(elsewhere.hints).toContainEqual(bobAlert());
  expect(await reads().unreadCounts()).toMatchObject([
    { firstUnreadMessageId: elsewhere.result.id, unreadReplyThreadIds: [] },
  ]);
});

test("a read that renews its viewing lease runs one lookup and two writes", async () => {
  await f.verifyEmails();
  const dm = await f
    .messaging("alice")
    .createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const first = (await send(dm.id, "first")).result;
  const { db, queries } = recordQueries();
  const renew = () =>
    commit(db, (tx) =>
      createMessagingService(tx, { userId: "bob", organizationId: f.orgA }).markRead(
        dm.id,
        first.id,
        { viewing: true },
      ),
    );
  expect((await renew()).result).toEqual({ read: true, moved: true, cleared: true });
  queries.length = 0;
  expect((await renew()).result).toEqual({ read: true, moved: false, cleared: false });
  // The workspace, the visible message, the position with its lease, and the notices.
  expect(queries).toHaveLength(4);
  const [position] = await f.db
    .select({ viewingUntil: messagingReadPositions.viewingUntil })
    .from(messagingReadPositions)
    .where(eq(messagingReadPositions.actorEntityId, f.bob));
  expect(position!.viewingUntil!.getTime()).toBeGreaterThan(Date.now());
});
