import { actors } from "../../core/actors/schema";
import { user } from "../../core/authentication/schema";
import { member } from "../../core/organizations/schema";
import { messagingMessages } from "./schema";
import { sql } from "drizzle-orm";

// Requires left joins of `user` on author_id and `actors` on author_actor_entity_id.
// A missing human author has no name here; each caller keeps its own fallback.
export function messageAuthorColumns(organizationId: string) {
  return {
    authorName: sql<string>`case when ${actors.type} = 'agent' then ${actors.name} else ${user.name} end`,
    authorType: sql<"human" | "agent">`coalesce(${actors.type}, 'human')`,
    authorExternal: sql<boolean>`coalesce(${actors.type}, 'human') <> 'agent' AND not exists (
      select 1 from ${member}
      where ${member.userId} = ${messagingMessages.authorId}
        and ${member.organizationId} = ${organizationId}
    )`,
  };
}
