import { managedPicture } from "@substrate/contracts/files/pictures";

import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { userAgents } from "../../core/actors/user-agents.schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import type { SessionIdentity } from "../../core/session/identity";
import type { MessagingSessionResolver } from "../../core/session/messaging";
import { AccessDeniedError } from "../../errors";
import { loadConversation } from "./access";
import { messagingMessages, messagingReactions } from "./schema";
import { and, asc, eq, gt, sql } from "drizzle-orm";

export function reactionOperations(
  db: DatabaseExecutor,
  scope: Readonly<SessionIdentity>,
  authenticate: MessagingSessionResolver,
) {
  return {
    async listReactions(
      messageId: string,
      options: { emoji?: string; afterActorId?: string; limit?: number } = {},
    ) {
      return db.transaction(async (tx) => {
        const { actor } = await authenticate(tx);
        const [message] = await tx
          .select({ conversationId: messagingMessages.conversationId })
          .from(messagingMessages)
          .where(eq(messagingMessages.id, messageId));
        if (!message) throw new AccessDeniedError();
        await loadConversation(tx, scope, message.conversationId);
        const limit = Math.min(50, Math.max(1, options.limit ?? 3));
        const rows = await tx
          .select({
            actorId: actors.entityId,
            name: sql<string>`case when ${actors.type} = 'agent'
              then coalesce(${userAgents.name}, 'Agent') else ${user.name} end`,
            image: sql<string | null>`case when ${actors.type} = 'agent' then
              case when ${userAgents.userId} = ${scope.userId}
                then '/api/v1/files/' || ${userAgents.imageFileId}::text || '/content' end
              else case when ${member.id} is not null then ${user.image} end end`.mapWith(
              (value: string | null) => {
                const parsed = managedPicture.safeParse(value);
                return parsed.success ? parsed.data : null;
              },
            ),
            type: actors.type,
            self: sql<boolean>`${actors.entityId} = ${actor.entityId}`,
            emojis: sql<
              string[]
            >`array_agg(${messagingReactions.emoji} order by ${messagingReactions.emoji})`,
          })
          .from(messagingReactions)
          .innerJoin(actors, eq(actors.entityId, messagingReactions.actorEntityId))
          .leftJoin(userAgents, eq(userAgents.id, actors.userAgentId))
          .leftJoin(user, eq(user.id, actors.userId))
          .leftJoin(
            member,
            and(eq(member.userId, actors.userId), eq(member.organizationId, scope.organizationId)),
          )
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
