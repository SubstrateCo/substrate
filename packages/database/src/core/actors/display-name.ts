import { user } from "../authentication/schema";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { sql, type SQLWrapper } from "drizzle-orm";

export interface ActorColumns {
  type: SQLWrapper;
  userId: SQLWrapper;
  userAgentId: SQLWrapper;
}

export function actorAuthorKind(ownerUserId: string, actor: ActorColumns = actors) {
  return sql<"owner" | "member" | "agent">`case
    when ${actor.type} = 'agent' then 'agent'
    when ${actor.userId} = ${ownerUserId} then 'owner'
    else 'member' end`;
}

export function actorDisplayName(actor: ActorColumns = actors) {
  return sql<string>`(CASE WHEN ${actor.type} = 'agent'
    THEN coalesce((SELECT dn_agent.name FROM ${userAgents} dn_agent WHERE dn_agent.id = ${actor.userAgentId}), 'Agent')
    ELSE (SELECT dn_user.name FROM ${user} dn_user WHERE dn_user.id = ${actor.userId}) END)`;
}
