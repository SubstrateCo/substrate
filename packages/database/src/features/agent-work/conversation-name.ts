import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { messagingConversations, messagingParticipants } from "../messaging/schema";
import { sql } from "drizzle-orm";

/**
 * The conversation's name as the viewer sees it: unnamed DMs and groups are named after the
 * other current members. Requires messaging_conversations in the outer query. Use only for
 * conversations the viewer can see.
 */
export function conversationName(viewerUserId: string) {
  const others = sql<
    string | null
  >`(select string_agg(coalesce(u.name, a.name), ', ' order by coalesce(u.name, a.name))
    from ${messagingParticipants} p
    join ${actors} a on a.entity_id = p.actor_entity_id
    left join ${user} u on u.id = a.user_id
    where p.conversation_id = ${messagingConversations.id} and p.left_at is null
      and a.user_id is distinct from ${viewerUserId})`;
  return sql<string>`coalesce(${messagingConversations.name}, ${others}, 'Direct conversation')`;
}
