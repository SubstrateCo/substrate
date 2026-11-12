import { entities } from "../entities/schema";
import { member } from "../organizations/schema";
import type { ActorScope } from "../repository-context";
import { actors } from "./schema";
import { userAgents } from "./user-agents.schema";
import { and, isNull, sql, type SQLWrapper } from "drizzle-orm";

// Callers also check the actor entity's organization and deletion state. Pass an alias of
// `actors` when the query uses one.
export function activeActorCondition(actor: typeof actors = actors) {
  return and(
    isNull(actor.disabledAt),
    sql`(
      (${actor.type} = 'human' AND EXISTS (
        SELECT 1 FROM ${member} m
        WHERE m.organization_id = ${actor.organizationId} AND m.user_id = ${actor.userId}
      )) OR
      (${actor.type} = 'agent' AND EXISTS (
          SELECT 1 FROM ${userAgents} a
          JOIN ${member} m ON m.user_id = a.user_id AND m.organization_id = ${actor.organizationId}
          JOIN ${actors} h ON h.user_id = a.user_id AND h.organization_id = m.organization_id AND h.type = 'human'
          JOIN ${entities} e ON e.entity_id = h.entity_id AND e.organization_id = h.organization_id
          WHERE a.id = ${actor.userAgentId} AND a.enabled = true AND a.deleted_at IS NULL
            AND h.disabled_at IS NULL AND e.deleted_at IS NULL
        )
      )
    )`,
  );
}

// Grants belong to people. A local agent uses its owner's human actor, so it can do what the
// owner can do in this organization. Unknown actors resolve to NULL.
// Future team agents need their own rule here.
export function permissionActorEntityId(scope: {
  organizationId: string;
  actorEntityId: string | SQLWrapper;
}) {
  return sql`(SELECT CASE WHEN pa.type = 'agent' THEN ph.entity_id ELSE pa.entity_id END
    FROM ${actors} pa
    LEFT JOIN ${userAgents} pua ON pa.type = 'agent' AND pua.id = pa.user_agent_id
    LEFT JOIN ${actors} ph ON ph.organization_id = pa.organization_id AND ph.user_id = pua.user_id
      AND ph.type = 'human'
    WHERE pa.organization_id = ${scope.organizationId} AND pa.entity_id = ${scope.actorEntityId}::uuid)`;
}

// People are visible to everyone in the organization. A local agent is visible only to its owner
// and the owner's agents.
export function visibleActorCondition(scope: ActorScope) {
  return sql`(${actors.type} = 'human' OR EXISTS (
    SELECT 1 FROM ${userAgents} vua
    JOIN ${actors} vv ON vv.organization_id = ${scope.organizationId}
      AND vv.entity_id = ${scope.actorEntityId}::uuid
    LEFT JOIN ${userAgents} vvua ON vvua.id = vv.user_agent_id
    WHERE vua.id = ${actors.userAgentId} AND vua.user_id = COALESCE(vv.user_id, vvua.user_id)
  ))`;
}
