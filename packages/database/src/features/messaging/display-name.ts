import { joinActorAccount, joinedActorName } from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";
import type { DatabaseExecutor } from "../../core/executor";
import { tasks } from "../tasks/tasks.schema";
import { approvedParticipant } from "./access";
import { messagingConversations, messagingParticipants } from "./schema";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

/**
 * The conversation's name as the viewer sees it: unnamed DMs and groups are named after the
 * other current, approved members, in member-list order. Use only for conversations the viewer
 * can see.
 */
export function conversationDisplayName(
  db: DatabaseExecutor,
  viewer: { userId: string; excludeActorId?: string },
  conversation: typeof messagingConversations = messagingConversations,
) {
  const memberName = joinedActorName();
  const others = joinActorAccount(
    db
      .select({
        names: sql<
          string | null
        >`string_agg(${memberName}, ', ' order by ${actors.type}, ${memberName}, ${actors.entityId})`,
      })
      .from(messagingParticipants)
      .innerJoin(actors, eq(actors.entityId, messagingParticipants.actorEntityId))
      .$dynamic(),
  ).where(
    and(
      eq(messagingParticipants.conversationId, conversation.id),
      isNull(messagingParticipants.leftAt),
      approvedParticipant(db, conversation),
      sql`${actors.userId} is distinct from ${viewer.userId}`,
      viewer.excludeActorId ? ne(actors.entityId, viewer.excludeActorId) : undefined,
    ),
  );
  return sql<string>`coalesce((select ${tasks.title} from ${tasks}
    where ${tasks.entityId} = ${conversation.taskEntityId} and ${tasks.organizationId} = ${conversation.organizationId}),
    ${conversation.name}, ${others}, 'Direct conversation')`;
}
