import { activeActorCondition, permissionActorEntityId } from "../actors/access";
import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { adminRoleCondition } from "../organizations/roles";
import { member } from "../organizations/schema";
import type { ActorScope, PermissionLevel } from "../repository-context";
import { entityAccessParents } from "./access-parents";
import { entityGrants } from "./schema";
import { sql, type SQLWrapper } from "drizzle-orm";

// Organization owners and admins are super users. People and personal mailbox or calendar
// records are excluded. Add a type here only when its domain is shared with the organization.
const adminEntityTypes = sql.raw(
  `'contact', 'company', 'project', 'task', 'file', 'folder', 'pipeline', 'deal'`,
);

// The role is read on every query, so promotion and demotion take effect at once. Agents resolve to
// their owner's human actor, like grants do.
function organizationAdminCondition(scope: ActorScope) {
  return sql`EXISTS (
    SELECT 1 FROM ${actors} oa
    JOIN ${member} om ON om.organization_id = oa.organization_id AND om.user_id = oa.user_id
    WHERE oa.organization_id = ${scope.organizationId} AND oa.entity_id = ${permissionActorEntityId(scope)}
      AND oa.type = 'human' AND oa.disabled_at IS NULL AND ${adminRoleCondition(sql`om.role`)}
  )`;
}

// Entities reached from the actor's grants, top-down, for list queries. Every link of the chain
// must be live. Admin access is not in this set; use readableCondition, which adds it per row.
export function visibilityCte(scope: ActorScope) {
  return sql`WITH RECURSIVE visible_entities(entity_id, level) AS (
    SELECT g.entity_id, g.level FROM ${entityGrants} g
    JOIN ${entities} e ON e.entity_id = g.entity_id AND e.organization_id = g.organization_id
    WHERE g.organization_id = ${scope.organizationId} AND g.actor_entity_id = ${permissionActorEntityId(scope)}
      AND e.deleted_at IS NULL
    UNION
    SELECT p.entity_id, v.level FROM visible_entities v
    JOIN ${entityAccessParents} p ON p.parent_entity_id = v.entity_id AND p.organization_id = ${scope.organizationId}
    JOIN ${entities} e ON e.entity_id = p.entity_id AND e.organization_id = p.organization_id
    WHERE e.deleted_at IS NULL
  )`;
}

// Admins own every live entity of a shared type. Every access child is a shared type today
// (tasks under projects), so a per-row type check equals inheriting admin access from an
// ancestor. Revisit this when a non-shared type gets a shared-type access parent.
export function adminOwnsCondition(scope: ActorScope, entityId: SQLWrapper) {
  return sql`(${organizationAdminCondition(scope)} AND EXISTS (
    SELECT 1 FROM ${entities} ae
    WHERE ae.organization_id = ${scope.organizationId} AND ae.entity_id = ${entityId}
      AND ae.deleted_at IS NULL AND ae.entity_type IN (${adminEntityTypes})
  ))`;
}

// Whether the actor can read the entity in a list query, at the minimum level. Uses one
// visibility CTE; admins are checked per row instead of enumerating the organization.
export function readableCondition(
  scope: ActorScope,
  entityId: SQLWrapper,
  minimum: PermissionLevel = "view",
) {
  return sql`(${entityId} IN (${visibilityCte(scope)}
    SELECT entity_id FROM visible_entities WHERE level >= ${minimum}::permission_level)
    OR ${adminOwnsCondition(scope, entityId)})`;
}

// The actor's strongest level on one entity, walking up from it: O(depth) index probes. A grant
// on an ancestor flows down; the walk stops at a deleted entity, so a deleted node on the path
// blocks inheritance through it. An admin owns the entity when a live node on the path has a
// shared type. UNION stops the walk on cycles.
export function entityAccessLevel(scope: ActorScope, entityId: SQLWrapper | string) {
  return sql`(WITH RECURSIVE access_path(entity_id, entity_type) AS (
    SELECT e.entity_id, e.entity_type FROM ${entities} e
    WHERE e.organization_id = ${scope.organizationId} AND e.entity_id = ${entityId}
      AND e.deleted_at IS NULL
    UNION
    SELECT e.entity_id, e.entity_type FROM access_path a
    JOIN ${entityAccessParents} p ON p.organization_id = ${scope.organizationId} AND p.entity_id = a.entity_id
    JOIN ${entities} e ON e.organization_id = p.organization_id AND e.entity_id = p.parent_entity_id
    WHERE e.deleted_at IS NULL
  )
  SELECT max(level) FROM (
    SELECT g.level FROM access_path a
    JOIN ${entityGrants} g ON g.organization_id = ${scope.organizationId} AND g.entity_id = a.entity_id
    WHERE g.actor_entity_id = ${permissionActorEntityId(scope)}
    UNION ALL
    SELECT 'owner'::permission_level FROM access_path a
    WHERE a.entity_type IN (${adminEntityTypes}) AND ${organizationAdminCondition(scope)}
  ) levels)`;
}

// Locks nothing and returns no rows unless the scope's actor is active.
export function lockAccessPath(scope: ActorScope, entityId: string) {
  return sql`WITH RECURSIVE ancestors(entity_id) AS (
    SELECT entity_id FROM ${entities}
    WHERE organization_id = ${scope.organizationId} AND entity_id = ${entityId}
    UNION
    SELECT p.parent_entity_id FROM ${entityAccessParents} p
    JOIN ancestors a ON a.entity_id = p.entity_id
    WHERE p.organization_id = ${scope.organizationId}
  )
  SELECT e.entity_id FROM ${entities} e
  WHERE e.organization_id = ${scope.organizationId} AND e.entity_id IN (SELECT entity_id FROM ancestors)
    AND EXISTS (
      SELECT 1 FROM ${actors}
      JOIN ${entities} actor_entity ON actor_entity.entity_id = ${actors.entityId}
        AND actor_entity.organization_id = ${actors.organizationId}
      WHERE ${actors.organizationId} = ${scope.organizationId}
        AND ${actors.entityId} = ${scope.actorEntityId}
        AND ${activeActorCondition()} AND actor_entity.deleted_at IS NULL
    )
  ORDER BY e.entity_id FOR UPDATE`;
}

export function inheritedOwnerQuery(scope: ActorScope, entityId: string) {
  return sql`WITH RECURSIVE ancestors(entity_id) AS (
    SELECT p.parent_entity_id FROM ${entityAccessParents} p
    JOIN ${entities} e ON e.organization_id = p.organization_id AND e.entity_id = p.parent_entity_id AND e.deleted_at IS NULL
    WHERE p.organization_id = ${scope.organizationId} AND p.entity_id = ${entityId}
    UNION
    SELECT p.parent_entity_id FROM ${entityAccessParents} p
    JOIN ancestors a ON a.entity_id = p.entity_id
    JOIN ${entities} e ON e.organization_id = p.organization_id AND e.entity_id = p.parent_entity_id AND e.deleted_at IS NULL
    WHERE p.organization_id = ${scope.organizationId}
  )
  SELECT 1 AS present FROM ancestors a JOIN ${entityGrants} g ON g.entity_id = a.entity_id
  WHERE g.organization_id = ${scope.organizationId} AND g.level = 'owner' LIMIT 1`;
}
