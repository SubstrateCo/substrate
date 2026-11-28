import type { AgentAvatarCode } from "@substrate/contracts/agents";

import type { ActorColumns } from "./display-name";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { sql } from "drizzle-orm";

export function joinedActorAvatar(actor: ActorColumns = actors) {
  return sql<AgentAvatarCode | null>`case when ${actor.type} = 'agent'
    then ${userAgents.avatarCode} end`;
}
