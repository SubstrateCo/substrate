import {
  joinActorProfile,
  joinedActorName,
  joinedActorPicture,
} from "../../../core/actors/joined-profile";
import { actors } from "../../../core/actors/schema";
import { userAgents } from "../../../core/actors/user-agents.schema";
import { user } from "../../../core/authentication/schema";
import type { DatabaseExecutor } from "../../../core/executor";
import { member } from "../../../core/organizations/schema";
import type { SessionIdentity } from "../../../core/session/identity";
import type { MessagingReader, MessagingSessionResolver } from "../../../core/session/messaging";
import { AccessDeniedError } from "../../../errors";
import { visibleConversations } from "../access";
import { messagingConversations, messagingMessages, messagingReactions } from "../schema";
import { and, asc, eq, gt, sql } from "drizzle-orm";

export function reactionOperations(
  db: DatabaseExecutor,
  scope: Readonly<SessionIdentity>,
  authenticate: MessagingSessionResolver,
  read: MessagingReader,
) {
  return {
    async listReactions(
      messageId: string,
      options: { emoji?: string; afterActorId?: string; limit?: number } = {},
    ) {
      return read(async (tx) => {
        const { actor } = await authenticate(tx);
        const [message] = await tx
          .select({ id: messagingMessages.id, deletedAt: messagingMessages.deletedAt })
          .from(messagingMessages)
          .innerJoin(
            messagingConversations,
            eq(messagingConversations.id, messagingMessages.conversationId),
          )
          .where(and(eq(messagingMessages.id, messageId), visibleConversations(tx, scope)));
        if (!message) throw new AccessDeniedError();
        // A reaction can land on a message deleted at the same instant. Deleted messages show none.
        if (message.deletedAt) return { items: [], nextCursor: null };
        const limit = Math.min(50, Math.max(1, options.limit ?? 3));
        const reactors = tx
          .select({
            actorId: actors.entityId,
            name: joinedActorName(),
            image: joinedActorPicture(scope.userId),
            type: actors.type,
            self: sql<boolean>`${actors.entityId} = ${actor.entityId}`,
            emojis: sql<
              string[]
            >`array_agg(${messagingReactions.emoji} order by ${messagingReactions.emoji})`,
          })
          .from(messagingReactions)
          .innerJoin(actors, eq(actors.entityId, messagingReactions.actorEntityId))
          .$dynamic();
        const rows = await joinActorProfile(reactors, scope.organizationId)
          .where(
            and(
              eq(messagingReactions.messageId, messageId),
              options.emoji ? eq(messagingReactions.emoji, options.emoji) : undefined,
              options.afterActorId ? gt(actors.entityId, options.afterActorId) : undefined,
            ),
          )
          .groupBy(actors.entityId, userAgents.id, user.id, member.id)
          .orderBy(asc(actors.entityId))
          .limit(limit + 1);
        const items = rows.slice(0, limit);
        return { items, nextCursor: rows.length > limit ? items.at(-1)!.actorId : null };
      });
    },
  };
}
