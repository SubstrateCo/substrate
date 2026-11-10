import type { DatabaseExecutor } from "../../client";
import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { approvedParticipant } from "./access";
import { messagingConversations, messagingParticipants } from "./schema";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

/**
 * The conversation's name as the viewer sees it: unnamed DMs and groups are named after the
 * other current, approved members, in member-list order. Requires messaging_conversations in the
 * outer query. Use only for conversations the viewer can see.
 */
export function conversationDisplayName(
  db: DatabaseExecutor,
  viewer: { userId: string; excludeActorId?: string },
) {
  const memberName = sql`coalesce(${user.name}, ${actors.name})`;
  const others = db
    .select({
      names: sql<
        string | null
      >`string_agg(${memberName}, ', ' order by ${actors.type}, ${memberName}, ${actors.entityId})`,
    })
    .from(messagingParticipants)
    .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
    .leftJoin(user, eq(user.id, actors.userId))
    .where(
      and(
        eq(messagingParticipants.conversationId, messagingConversations.id),
        isNull(messagingParticipants.leftAt),
        approvedParticipant(db),
        sql`${actors.userId} is distinct from ${viewer.userId}`,
        viewer.excludeActorId ? ne(actors.entityId, viewer.excludeActorId) : undefined,
      ),
    );
  return sql<string>`coalesce(${messagingConversations.name}, ${others}, 'Direct conversation')`;
}
