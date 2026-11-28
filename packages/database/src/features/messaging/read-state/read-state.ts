import { realtimeKeys } from "@substrate/contracts/realtime";

import { actors } from "../../../core/actors/schema";
import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import type { MessagingSessionResolver } from "../../../core/session/messaging";
import { AccessDeniedError } from "../../../errors";
import { notifications } from "../../notifications/schema";
import { denyDeletedConversation, liveApprovedParticipant, visibleConversations } from "../access";
import { messagingConversations, messagingMessages, messagingParticipants } from "../schema";
import { messagingReadPositions, messagingThreadReadPositions } from "./read-state.schema";
import {
  and,
  eq,
  exists,
  gt,
  inArray,
  is,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias, PgTransaction, type AnyPgColumn } from "drizzle-orm/pg-core";

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

const lease = (viewing: boolean | undefined) =>
  viewing === undefined ? {} : { viewingUntil: viewing ? viewingLease : null };

function forward(position: Position, at: SQL, messageId: string, viewing: boolean | undefined) {
  if (viewing === undefined)
    return {
      set: { messageId, messageCreatedAt: at },
      setWhere: before(position, at, messageId),
    };
  const unlessBehind = (next: SQL, current: AnyPgColumn) =>
    sql`CASE WHEN ${before(position, at, messageId)} THEN ${next} ELSE ${current} END`;
  return {
    set: {
      messageId: unlessBehind(sql`${messageId}::uuid`, position.messageId),
      messageCreatedAt: unlessBehind(at, position.messageCreatedAt),
      ...lease(viewing),
    },
  };
}

// Whether the returned row's message differs from the row before this statement. The subquery
// reads the statement's snapshot, so `where` finds the earlier row, or none for a first read.
const movedFrom = (position: Position, where: SQL) =>
  sql<boolean>`(SELECT prior.message_id FROM ${position} prior WHERE ${where})
    IS DISTINCT FROM ${position.messageId}`;

export function readOperations(
  db: DatabaseExecutor,
  scope: Readonly<SessionIdentity>,
  authenticate: MessagingSessionResolver,
) {
  async function unreadRows(includeMessageIds = false) {
    const { actor } = await authenticate(db);
    if (scope.actorEntityId) throw new AccessDeniedError();
    const mention = `@[person:${actor.entityId.toLowerCase()}]`;
    const mentions = (body: AnyPgColumn) => sql`strpos(lower(${body}), ${mention}) > 0`;
    const mentionCount = sql<number>`(count(*) FILTER (WHERE ${mentions(messagingMessages.body)}))::int`;
    const unreadFromOthers = () =>
      and(
        liveApprovedParticipant(db),
        visibleConversations(db, scope),
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
    const timeline = await db
      .select({
        conversationId: messagingConversations.id,
        unreadCount: sql<number>`count(*)::int`,
        messageIds: includeMessageIds
          ? sql<string[]>`array_agg(${messagingMessages.id}::text)`
          : sql<string[]>`ARRAY[]::text[]`,
        mentionCount,
        firstUnreadMessageId: sql<string | null>`(array_agg(${messagingMessages.id}
            ORDER BY ${messagingMessages.createdAt}, ${messagingMessages.id}))[1]`,
      })
      .from(messagingConversations)
      .innerJoin(messagingParticipants, membership)
      .innerJoin(messagingMessages, eq(messagingMessages.conversationId, messagingConversations.id))
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
    const inThread = alias(messagingMessages, "in_thread");
    const followed = or(
      inArray(messagingConversations.kind, ["dm", "agent_dm"]),
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
        messageIds: includeMessageIds
          ? sql<string[]>`array_agg(${messagingMessages.id}::text)`
          : sql<string[]>`ARRAY[]::text[]`,
        mentionCount,
        unreadReplyThreadIds: sql<string[]>`array_agg(${messagingMessages.threadId}::text
            ORDER BY ${messagingMessages.createdAt}, ${messagingMessages.id})`,
      })
      .from(messagingConversations)
      .innerJoin(messagingParticipants, membership)
      .innerJoin(messagingMessages, eq(messagingMessages.conversationId, messagingConversations.id))
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
    const counts = timeline.map((row) => {
      const reply = repliesIn.get(row.conversationId);
      repliesIn.delete(row.conversationId);
      return {
        ...row,
        unreadCount: row.unreadCount + (reply?.unreadCount ?? 0),
        messageIds: [...row.messageIds, ...(reply?.messageIds ?? [])],
        mentionCount: row.mentionCount + (reply?.mentionCount ?? 0),
        unreadReplyThreadIds: reply?.unreadReplyThreadIds ?? [],
      };
    });
    for (const reply of repliesIn.values()) counts.push({ ...reply, firstUnreadMessageId: null });
    return counts;
  }
  return {
    async unreadCounts(): Promise<UnreadCount[]> {
      return (await unreadRows()).map(({ messageIds, ...row }) => {
        void messageIds;
        return row;
      });
    },
    async unreadMessageIds() {
      return (await unreadRows(true)).flatMap((row) => row.messageIds);
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
      const work = async (tx: DatabaseExecutor) => {
        const { actor } = await authenticate(tx);
        const [message] = await tx
          .select({
            id: messagingMessages.id,
            threadId: messagingMessages.threadId,
            at: sql<string>`${messagingMessages.createdAt}::text`,
          })
          .from(messagingMessages)
          .innerJoin(
            messagingConversations,
            eq(messagingConversations.id, messagingMessages.conversationId),
          )
          .where(
            and(
              eq(messagingMessages.id, messageId),
              eq(messagingMessages.conversationId, conversationId),
              visibleConversations(tx, scope),
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
        const [position] = await (
          threadId
            ? tx
                .insert(messagingThreadReadPositions)
                .values({ ...values, threadId, ...lease(options.viewing) })
                .onConflictDoUpdate({
                  target: [
                    messagingThreadReadPositions.threadId,
                    messagingThreadReadPositions.actorEntityId,
                  ],
                  ...forward(messagingThreadReadPositions, at, messageId, options.viewing),
                })
                .returning({
                  moved: movedFrom(
                    messagingThreadReadPositions,
                    sql`prior.thread_id = ${threadId} AND prior.actor_entity_id = ${actor.entityId}`,
                  ),
                })
            : tx
                .insert(messagingReadPositions)
                .values({ ...values, ...lease(options.viewing) })
                .onConflictDoUpdate({
                  target: [
                    messagingReadPositions.conversationId,
                    messagingReadPositions.actorEntityId,
                  ],
                  ...forward(messagingReadPositions, at, messageId, options.viewing),
                })
                .returning({
                  moved: movedFrom(
                    messagingReadPositions,
                    sql`prior.conversation_id = ${conversationId} AND prior.actor_entity_id = ${actor.entityId}`,
                  ),
                })
        ).catch((error: Error) => denyDeletedConversation(error));
        const moved = !!position?.moved;
        if (moved)
          effectsFor(tx).hint({
            audience: realtimeKeys.actor(scope.organizationId, actor.entityId),
            domain: "messaging",
            scope: "read",
          });
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
        return { read: true, moved, cleared: cleared.length > 0 };
      };
      return is(db, PgTransaction) ? work(db) : db.transaction(work);
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
