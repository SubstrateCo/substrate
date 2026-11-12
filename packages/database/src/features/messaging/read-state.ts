import { realtimeKeys } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { effectsFor } from "../../core/effects";
import type { SessionIdentity } from "../../core/session/identity";
import { messagingSession } from "../../core/session/messaging";
import { AccessDeniedError } from "../../errors";
import { loadConversation, liveApprovedParticipant, visibleConversations } from "./access";
import { messagingReadPositions } from "./read-state.schema";
import { messagingConversations, messagingMessages, messagingParticipants } from "./schema";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

export function readOperations(db: DatabaseExecutor, scope: Readonly<SessionIdentity>) {
  return {
    async unreadCounts() {
      const { actor } = await messagingSession(db, scope);
      if (scope.actorEntityId) throw new AccessDeniedError();
      return db
        .select({
          conversationId: messagingConversations.id,
          unreadCount: sql<number>`count(*)::int`,
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
            visibleConversations(db, scope),
            liveApprovedParticipant(db),
            ne(messagingMessages.authorActorEntityId, actor.entityId),
            sql`NOT EXISTS (SELECT 1 FROM ${actors} author
            WHERE author.entity_id = ${messagingMessages.authorActorEntityId}
              AND author.user_id = ${scope.userId})`,
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
        const { actor } = await messagingSession(tx, scope);
        await loadConversation(tx, scope, conversationId, "share");
        const [message] = await tx
          .select({ id: messagingMessages.id })
          .from(messagingMessages)
          .where(
            and(
              eq(messagingMessages.id, messageId),
              eq(messagingMessages.conversationId, conversationId),
            ),
          );
        if (!message) throw new AccessDeniedError();
        const at = sql`(SELECT created_at FROM ${messagingMessages} WHERE id = ${messageId}::uuid)`;
        await tx
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
          });
        effectsFor(tx).hint({
          audience: realtimeKeys.actor(scope.organizationId, actor.entityId),
          domain: "messaging",
        });
        return { read: true };
      });
    },
  };
}
