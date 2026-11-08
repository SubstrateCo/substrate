import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import type { ActorScope } from "../repository-context";
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
      (${actors.type} = 'agent' AND EXISTS (
          SELECT 1 FROM ${userAgents} a
          JOIN ${member} m ON m.user_id = a.user_id AND m.organization_id = ${actors.organizationId}
          JOIN ${actors} h ON h.user_id = a.user_id AND h.organization_id = m.organization_id AND h.type = 'human'
          JOIN ${entities} e ON e.entity_id = h.entity_id AND e.organization_id = h.organization_id
          WHERE a.id = ${actors.userAgentId} AND a.enabled = true AND a.deleted_at IS NULL
            AND h.disabled_at IS NULL AND e.deleted_at IS NULL
        )
      )
    )`,
  );
}

export function permissionActorEntityId(scope: ActorScope) {
  return sql`${scope.actorEntityId}::uuid`;
}
