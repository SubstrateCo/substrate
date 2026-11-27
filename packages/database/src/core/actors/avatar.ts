import type { AgentAvatarCode } from "@substrate/contracts/agents";

import type { ActorColumns } from "./display-name";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { sql } from "drizzle-orm";

// An agent's avatar code is not private: every viewer who can see the agent actor sees it. The
// code belongs to the user agent, so the agent looks the same in every organization.

/** The agent's avatar code, or null for a person. Needs the joins from joinActorAccount. */
export function joinedActorAvatar(actor: ActorColumns = actors) {
  return sql<AgentAvatarCode | null>`case when ${actor.type} = 'agent'
    then ${userAgents.avatarCode} end`;
}
