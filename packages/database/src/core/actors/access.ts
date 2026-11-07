import { member } from "../organizations/schema";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { and, isNull, sql } from "drizzle-orm";

// Callers also check the actor entity's organization and deletion state.
export function activeActorCondition() {
  return and(
    isNull(actors.disabledAt),
    sql`(
      (${actors.type} = 'human' AND EXISTS (
        SELECT 1 FROM ${member} m
        WHERE m.organization_id = ${actors.organizationId} AND m.user_id = ${actors.userId}
      )) OR
      (${actors.type} = 'agent' AND (
        ${actors.userAgentId} IS NULL OR EXISTS (
          SELECT 1 FROM ${userAgents} a
          JOIN ${member} m ON m.user_id = a.user_id AND m.organization_id = ${actors.organizationId}
          WHERE a.id = ${actors.userAgentId} AND a.enabled = true AND a.deleted_at IS NULL
        )
      ))
    )`,
  );
}
