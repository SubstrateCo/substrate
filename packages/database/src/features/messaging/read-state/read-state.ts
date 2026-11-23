import { realtimeKeys } from "@substrate/contracts/realtime";

import { actors } from "../../../core/actors/schema";
import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import type { MessagingSessionResolver } from "../../../core/session/messaging";
import { AccessDeniedError } from "../../../errors";
import {
  denyDeletedConversation,
  loadConversation,
  liveApprovedParticipant,
  visibleConversations,
} from "../access";
import { messagingReadPositions } from "./read-state.schema";
import { messagingConversations, messagingMessages, messagingParticipants } from "../schema";
import { and, eq, isNull, ne, notInArray, sql } from "drizzle-orm";

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
      return db
        .select({
          conversationId: messagingConversations.id,
          unreadCount: sql<number>`count(*)::int`,
          mentionCount: sql<number>`(count(*) FILTER (WHERE
            strpos(lower(${messagingMessages.body}), ${mention}) > 0))::int`,
          // The oldest unread message of the main timeline, where the "New" divider goes. Unread
          // thread replies count but stay in their thread.
          firstUnreadMessageId: sql<string | null>`(array_agg(${messagingMessages.id}
            ORDER BY ${messagingMessages.createdAt}, ${messagingMessages.id})
            FILTER (WHERE ${messagingMessages.threadId} IS NULL))[1]`,
        })
        .from(messagingConversations)
        .innerJoin(
          messagingParticipants,
          and(
            eq(messagingParticipants.conversationId, messagingConversations.id),
            eq(messagingParticipants.actorEntityId, actor.entityId),
          ),
        )
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
            // Authentication resolves the scope's human actor. Its approved participation
            // already satisfies visibleConversations, including partner conversations.
            liveApprovedParticipant(db),
            visibleConversations(db, scope),
            // Match the Messages list: task discussions open only from their task, so they must
            // not light the Messages dot with nothing there to read.
            isNull(messagingConversations.taskEntityId),
            ne(messagingMessages.authorActorEntityId, actor.entityId),
            notInArray(
              messagingMessages.authorActorEntityId,
              db
                .select({ id: actors.entityId })
                .from(actors)
                .where(eq(actors.userId, scope.userId)),
            ),
            isNull(messagingMessages.deletedAt),
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
    },
    async markRead(conversationId: string, messageId: string) {
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db.transaction(async (tx) => {
        const { actor, context } = await authenticate(tx);
        const conversation = await loadConversation(tx, scope, conversationId);
        if (conversation.taskEntityId)
          await context.requireAccess(conversation.taskEntityId, "view");
        const [message] = await tx
          .select({
            id: messagingMessages.id,
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
        const at = sql`${message.at}::timestamptz`;
        const changed = await tx
          .insert(messagingReadPositions)
          .values({
            conversationId,
            organizationId: scope.organizationId,
            actorEntityId: actor.entityId,
            messageId,
            messageCreatedAt: at,
          })
          .onConflictDoUpdate({
            target: [messagingReadPositions.conversationId, messagingReadPositions.actorEntityId],
            set: { messageId, messageCreatedAt: at },
            setWhere: sql`(${messagingReadPositions.messageCreatedAt}, ${messagingReadPositions.messageId}) < (${at}, ${messageId}::uuid)`,
          })
          .returning({ messageId: messagingReadPositions.messageId })
          .catch((error: Error) => denyDeletedConversation(error));
        // A read position changes only the reader's unread counts, on the reader's devices.
        if (changed.length)
          effectsFor(tx).hint({
            audience: realtimeKeys.actor(scope.organizationId, actor.entityId),
            domain: "messaging",
            scope: "read",
          });
        return { read: true };
      });
    },
  };
}
