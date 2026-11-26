import { realtimeKeys } from "@substrate/contracts/realtime";

import { actors } from "../../../core/actors/schema";
import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import type { MessagingSessionResolver } from "../../../core/session/messaging";
import { AccessDeniedError } from "../../../errors";
import { notifications } from "../../notifications/schema";
import {
  denyDeletedConversation,
  loadConversation,
  liveApprovedParticipant,
  visibleConversations,
} from "../access";
import { messagingConversations, messagingMessages, messagingParticipants } from "../schema";
import { messagingReadPositions, messagingThreadReadPositions } from "./read-state.schema";
import {
  and,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";

// The client renews a lease about every 30 seconds while the newest message is in view in a
// focused window. A closed or sleeping window stops renewing, so its lease ends soon after.
const viewingLease = sql`now() + interval '45 seconds'`;

type UnreadCount = {
  conversationId: string;
  unreadCount: number;
  mentionCount: number;
  firstUnreadMessageId: string | null;
  unreadReplyThreadIds: string[];
};
type Position = typeof messagingReadPositions | typeof messagingThreadReadPositions;
const before = (position: Position, at: SQL, messageId: string) =>
  sql`(${position.messageCreatedAt}, ${position.messageId}) < (${at}, ${messageId}::uuid)`;

export function readOperations(
  db: DatabaseExecutor,
  scope: Readonly<SessionIdentity>,
  authenticate: MessagingSessionResolver,
) {
  return {
    async unreadCounts() {
      const { actor } = await authenticate(db);
      if (scope.actorEntityId) throw new AccessDeniedError();
      // Person mentions are the body's `@[person:<actor>]` tokens, which sending and editing
      // check. Matching is case-insensitive, like the parser.
      const mention = `@[person:${actor.entityId.toLowerCase()}]`;
      const mentions = (body: AnyPgColumn) => sql`strpos(lower(${body}), ${mention}) > 0`;
      const mentionCount = sql<number>`(count(*) FILTER (WHERE ${mentions(messagingMessages.body)}))::int`;
      // Live messages others wrote, in conversations the Messages list shows.
      const unreadFromOthers = () =>
        and(
          // Authentication resolves the scope's human actor. Its approved participation already
          // satisfies visibleConversations, including partner conversations.
          liveApprovedParticipant(db),
          visibleConversations(db, scope),
          // Match the Messages list: task discussions open only from their task, so they must not
          // light the Messages dot with nothing there to read.
          isNull(messagingConversations.taskEntityId),
          ne(messagingMessages.authorActorEntityId, actor.entityId),
          notInArray(
            messagingMessages.authorActorEntityId,
            db.select({ id: actors.entityId }).from(actors).where(eq(actors.userId, scope.userId)),
          ),
          isNull(messagingMessages.deletedAt),
        );
      const membership = and(
        eq(messagingParticipants.conversationId, messagingConversations.id),
        eq(messagingParticipants.actorEntityId, actor.entityId),
      );
      // The main timeline counts against the conversation's read position.
      const timeline = await db
        .select({
          conversationId: messagingConversations.id,
          unreadCount: sql<number>`count(*)::int`,
          mentionCount,
          // Where the "New" divider goes.
          firstUnreadMessageId: sql<string | null>`(array_agg(${messagingMessages.id}
            ORDER BY ${messagingMessages.createdAt}, ${messagingMessages.id}))[1]`,
        })
        .from(messagingConversations)
        .innerJoin(messagingParticipants, membership)
        .innerJoin(
          messagingMessages,
          eq(messagingMessages.conversationId, messagingConversations.id),
        )
        .leftJoin(
          messagingReadPositions,
          and(
            eq(messagingReadPositions.conversationId, messagingConversations.id),
            eq(messagingReadPositions.actorEntityId, actor.entityId),
          ),
        )
        .where(
          and(
            unreadFromOthers(),
            isNull(messagingMessages.threadId),
            // Bounds the message index scan to unread rows. The joined read position cannot,
            // because it is on the nullable side of the left join. The row comparison is exact.
            sql`${messagingMessages.createdAt} >= coalesce((SELECT bound.message_created_at
              FROM ${messagingReadPositions} bound
              WHERE bound.conversation_id = ${messagingConversations.id}
                AND bound.actor_entity_id = ${actor.entityId}), '-infinity'::timestamptz)`,
            sql`(${messagingReadPositions.messageCreatedAt} IS NULL OR
            (${messagingMessages.createdAt}, ${messagingMessages.id}) >
            (${messagingReadPositions.messageCreatedAt}, ${messagingReadPositions.messageId}))`,
          ),
        )
        .groupBy(messagingConversations.id);
      // Replies count against their own thread's position, and only in threads the reader follows:
      // every thread of a direct message, and elsewhere threads they wrote in or were mentioned in.
      // These are the people reply notifications reach.
      const inThread = alias(messagingMessages, "in_thread");
      const followed = or(
        eq(messagingConversations.kind, "dm"),
        exists(
          db
            .select({ one: sql`1` })
            .from(inThread)
            .where(
              and(
                eq(inThread.conversationId, messagingMessages.conversationId),
                or(
                  eq(inThread.id, messagingMessages.threadId),
                  eq(inThread.threadId, messagingMessages.threadId),
                ),
                isNull(inThread.deletedAt),
                or(eq(inThread.authorActorEntityId, actor.entityId), mentions(inThread.body)),
              ),
            ),
        ),
      );
      const replies = await db
        .select({
          conversationId: messagingConversations.id,
          unreadCount: sql<number>`count(*)::int`,
          mentionCount,
          // The root of each unread reply, once per reply, so the timeline can mark its thread.
          unreadReplyThreadIds: sql<string[]>`array_agg(${messagingMessages.threadId}::text
            ORDER BY ${messagingMessages.createdAt}, ${messagingMessages.id})`,
        })
        .from(messagingConversations)
        .innerJoin(messagingParticipants, membership)
        .innerJoin(
          messagingMessages,
          eq(messagingMessages.conversationId, messagingConversations.id),
        )
        .leftJoin(
          messagingThreadReadPositions,
          and(
            eq(messagingThreadReadPositions.threadId, messagingMessages.threadId),
            eq(messagingThreadReadPositions.actorEntityId, actor.entityId),
          ),
        )
        .where(
          and(
            unreadFromOthers(),
            isNotNull(messagingMessages.threadId),
            sql`(${messagingThreadReadPositions.messageCreatedAt} IS NULL OR
            (${messagingMessages.createdAt}, ${messagingMessages.id}) >
            (${messagingThreadReadPositions.messageCreatedAt}, ${messagingThreadReadPositions.messageId}))`,
            followed,
          ),
        )
        .groupBy(messagingConversations.id);
      const repliesIn = new Map(replies.map((row) => [row.conversationId, row]));
      const counts: UnreadCount[] = timeline.map((row) => {
        const reply = repliesIn.get(row.conversationId);
        repliesIn.delete(row.conversationId);
        return {
          ...row,
          unreadCount: row.unreadCount + (reply?.unreadCount ?? 0),
          mentionCount: row.mentionCount + (reply?.mentionCount ?? 0),
          unreadReplyThreadIds: reply?.unreadReplyThreadIds ?? [],
        };
      });
      for (const reply of repliesIn.values()) counts.push({ ...reply, firstUnreadMessageId: null });
      return counts;
    },
    /**
     * Reads the main timeline through a top-level message, or a thread through one of its replies.
     * Name the thread to read a thread through its root, which marks a thread with no replies.
     * `viewing` starts or ends the reader's viewing lease on that timeline or thread.
     */
    async markRead(
      conversationId: string,
      messageId: string,
      options: { threadId?: string; viewing?: boolean } = {},
    ) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor, context } = await authenticate(tx);
        const conversation = await loadConversation(tx, scope, conversationId);
        if (conversation.taskEntityId)
          await context.requireAccess(conversation.taskEntityId, "view");
        const [message] = await tx
          .select({
            id: messagingMessages.id,
            threadId: messagingMessages.threadId,
            at: sql<string>`${messagingMessages.createdAt}::text`,
          })
          .from(messagingMessages)
          .where(
            and(
              eq(messagingMessages.id, messageId),
              eq(messagingMessages.conversationId, conversationId),
            ),
          );
        if (!message) throw new AccessDeniedError();
        const threadId =
          message.threadId ?? (options.threadId === message.id ? message.id : undefined);
        if (options.threadId && options.threadId !== threadId) throw new AccessDeniedError();
        const at = sql`${message.at}::timestamptz`;
        const values = {
          conversationId,
          organizationId: scope.organizationId,
          actorEntityId: actor.entityId,
          messageId,
          messageCreatedAt: at,
        };
        const changed = await (
          threadId
            ? tx
                .insert(messagingThreadReadPositions)
                .values({ ...values, threadId })
                .onConflictDoUpdate({
                  target: [
                    messagingThreadReadPositions.threadId,
                    messagingThreadReadPositions.actorEntityId,
                  ],
                  set: { messageId, messageCreatedAt: at },
                  setWhere: before(messagingThreadReadPositions, at, messageId),
                })
                .returning({ messageId: messagingThreadReadPositions.messageId })
            : tx
                .insert(messagingReadPositions)
                .values(values)
                .onConflictDoUpdate({
                  target: [
                    messagingReadPositions.conversationId,
                    messagingReadPositions.actorEntityId,
                  ],
                  set: { messageId, messageCreatedAt: at },
                  setWhere: before(messagingReadPositions, at, messageId),
                })
                .returning({ messageId: messagingReadPositions.messageId })
        ).catch((error: Error) => denyDeletedConversation(error));
        if (options.viewing !== undefined) {
          const viewingUntil = options.viewing ? viewingLease : null;
          await (threadId
            ? tx
                .update(messagingThreadReadPositions)
                .set({ viewingUntil })
                .where(
                  and(
                    eq(messagingThreadReadPositions.threadId, threadId),
                    eq(messagingThreadReadPositions.actorEntityId, actor.entityId),
                  ),
                )
            : tx
                .update(messagingReadPositions)
                .set({ viewingUntil })
                .where(
                  and(
                    eq(messagingReadPositions.conversationId, conversationId),
                    eq(messagingReadPositions.actorEntityId, actor.entityId),
                  ),
                ));
        }
        // A read position changes only the reader's unread counts, on the reader's devices.
        if (changed.length)
          effectsFor(tx).hint({
            audience: realtimeKeys.actor(scope.organizationId, actor.entityId),
            domain: "messaging",
            scope: "read",
          });
        // Messages the reader has seen no longer need their attention. Clear only the notices in
        // the timeline or thread that was read, up to the read message, so a later message stays
        // unread. This runs even when the position did not move, so a notice created at the
        // boundary is not left behind.
        const cleared = await tx
          .update(notifications)
          .set({ readAt: sql`now()` })
          .where(
            and(
              eq(notifications.organizationId, scope.organizationId),
              eq(notifications.recipientActorEntityId, actor.entityId),
              isNull(notifications.readAt),
              isNull(notifications.entityId),
              inArray(
                notifications.messageId,
                tx
                  .select({ id: messagingMessages.id })
                  .from(messagingMessages)
                  .where(
                    and(
                      eq(messagingMessages.conversationId, conversationId),
                      threadId
                        ? eq(messagingMessages.threadId, threadId)
                        : isNull(messagingMessages.threadId),
                      sql`(${messagingMessages.createdAt}, ${messagingMessages.id}) <= (${at}, ${messageId}::uuid)`,
                    ),
                  ),
              ),
            ),
          )
          .returning({ id: notifications.id });
        if (cleared.length)
          effectsFor(tx).hint({
            audience: realtimeKeys.user(scope.userId),
            domain: "notifications",
          });
        return { read: true };
      });
    },
  };
}

/**
 * Runs in the transaction that sends a message, before its notifications. Readers whose viewing
 * lease covers the message's timeline or thread read it as it arrives, so it never shows as unread
 * for them. Returns those readers' actors.
 */
export async function readForViewers(
  db: DatabaseExecutor,
  message: Pick<
    typeof messagingMessages.$inferSelect,
    "id" | "conversationId" | "threadId" | "authorActorEntityId"
  >,
) {
  // The stored time, at full precision, so the read position matches the message exactly.
  const at = sql`(SELECT ${messagingMessages.createdAt} FROM ${messagingMessages}
    WHERE ${messagingMessages.id} = ${message.id}::uuid)`;
  const viewers = await (message.threadId
    ? db
        .update(messagingThreadReadPositions)
        .set({ messageId: message.id, messageCreatedAt: at })
        .where(
          and(
            eq(messagingThreadReadPositions.threadId, message.threadId),
            gt(messagingThreadReadPositions.viewingUntil, sql`now()`),
            ne(messagingThreadReadPositions.actorEntityId, message.authorActorEntityId),
            before(messagingThreadReadPositions, at, message.id),
          ),
        )
        .returning({ actorEntityId: messagingThreadReadPositions.actorEntityId })
    : db
        .update(messagingReadPositions)
        .set({ messageId: message.id, messageCreatedAt: at })
        .where(
          and(
            eq(messagingReadPositions.conversationId, message.conversationId),
            gt(messagingReadPositions.viewingUntil, sql`now()`),
            ne(messagingReadPositions.actorEntityId, message.authorActorEntityId),
            before(messagingReadPositions, at, message.id),
          ),
        )
        .returning({ actorEntityId: messagingReadPositions.actorEntityId }));
  return viewers.map((viewer) => viewer.actorEntityId);
}
