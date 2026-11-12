import { activeActorCondition, permissionActorEntityId } from "../actors/access";
import { actors } from "../actors/schema";
import { entities, type entityType } from "../entities/schema";
import { adminRoleCondition } from "../organizations/roles";
import { member } from "../organizations/schema";
import type { AccessPathLockMode, ActorScope, PermissionLevel } from "../repository-context";
import { entityGrants } from "./schema";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

// Organization owners and admins are super users. People and personal mailbox or calendar
// records are excluded. Add a type here only when its domain is shared with the organization.
// A child inherits admin access from its container's type.
const adminEntityTypes = sql.raw(
  (
    [
      "contact",
      "company",
      "project",
      "task",
      "file",
      "folder",
      "pipeline",
      "deal",
    ] as const satisfies readonly (typeof entityType.enumValues)[number][]
  )
    .map((type) => `'${type}'`)
    .join(", "),
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

// Every entity has an access container: a root is its own container, and a child (a task) uses
// its parent (the project). Grants are set on containers. An entity is visible at the grant's
// level when the entity and its container are live.
function visibleEntitiesQuery(scope: ActorScope) {
  return sql`SELECT e.entity_id, g.level FROM ${entityGrants} g
    JOIN ${entities} c ON c.organization_id = g.organization_id AND c.entity_id = g.entity_id
      AND c.deleted_at IS NULL
    JOIN ${entities} e ON e.organization_id = c.organization_id AND e.access_entity_id = c.entity_id
      AND e.deleted_at IS NULL
    WHERE g.organization_id = ${scope.organizationId} AND g.actor_entity_id = ${permissionActorEntityId(scope)}`;
}

// Entities the actor's grants reach, for list queries. Admin access is not in this set; use
// readableCondition, which adds it per row.
export function visibilityCte(scope: ActorScope) {
  return sql`WITH visible_entities(entity_id, level) AS (${visibleEntitiesQuery(scope)})`;
}

export function withVisibility(scope: ActorScope, query: SQL) {
  return sql`${visibilityCte(scope)} ${query}`;
}

export function readableFromCte(
  scope: ActorScope,
  entityId: SQLWrapper,
  minimum: PermissionLevel = "view",
) {
  return sql`(${entityId} IN (SELECT entity_id FROM visible_entities
    WHERE level >= ${minimum}::permission_level)
    OR ${adminOwnsCondition(scope, entityId)})`;
}

// Admins own every live entity in a live container of a shared type.
export function adminOwnsCondition(scope: ActorScope, entityId: SQLWrapper) {
  return sql`(${organizationAdminCondition(scope)} AND EXISTS (
    SELECT 1 FROM ${entities} ae
    JOIN ${entities} ac ON ac.organization_id = ae.organization_id AND ac.entity_id = ae.access_entity_id
      AND ac.deleted_at IS NULL
    WHERE ae.organization_id = ${scope.organizationId} AND ae.entity_id = ${entityId}
      AND ae.deleted_at IS NULL AND ac.entity_type IN (${adminEntityTypes})
  ))`;
}

// Whether the actor can read the entity in a list query, at the minimum level. The subquery does
// not depend on the row, so it runs once; admins are checked per row instead of enumerating the
// organization.
export function readableCondition(
  scope: ActorScope,
  entityId: SQLWrapper,
  minimum: PermissionLevel = "view",
) {
  return sql`(${entityId} IN (SELECT v.entity_id FROM (${visibleEntitiesQuery(scope)}) v
    WHERE v.level >= ${minimum}::permission_level)
    OR ${adminOwnsCondition(scope, entityId)})`;
}

// The actor's strongest level on one entity. It comes from grants on the entity's container, and
// the entity and its container must be live. An admin owns it when its container has a shared
// type, the same check as adminOwnsCondition.
export function entityAccessLevel(scope: ActorScope, entityId: SQLWrapper | string) {
  return sql`(SELECT max(level) FROM (
    SELECT g.level FROM ${entities} e
    JOIN ${entities} c ON c.organization_id = e.organization_id AND c.entity_id = e.access_entity_id
      AND c.deleted_at IS NULL
    JOIN ${entityGrants} g ON g.organization_id = c.organization_id AND g.entity_id = c.entity_id
    WHERE e.organization_id = ${scope.organizationId} AND e.entity_id = ${entityId}
      AND e.deleted_at IS NULL AND g.actor_entity_id = ${permissionActorEntityId(scope)}
    UNION ALL
    SELECT 'owner'::permission_level FROM ${entities} e
    JOIN ${entities} c ON c.organization_id = e.organization_id AND c.entity_id = e.access_entity_id
      AND c.deleted_at IS NULL
    WHERE e.organization_id = ${scope.organizationId} AND e.entity_id = ${entityId}
      AND e.deleted_at IS NULL AND c.entity_type IN (${adminEntityTypes})
      AND ${organizationAdminCondition(scope)}
  ) levels)`;
}

// Materialize the global order before the correlated locking subqueries run: containers first,
// then children, each by ID. Each lateral branch locks just that row, without a lock upgrade.
// A container named as a target gets the stronger lock from the start. Inactive actors lock nothing.
export function lockAccessPaths(
  scope: ActorScope,
  entityIds: string[],
  mode: AccessPathLockMode = "ordinary",
) {
  const ids = sql.join(
    entityIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  return sql`WITH access_paths AS MATERIALIZED (
  SELECT e.entity_id, (${mode === "structural"} OR e.entity_id IN (${ids})) AS exclusive_lock
  FROM ${entities} e
  WHERE e.organization_id = ${scope.organizationId} AND (e.entity_id IN (${ids})
      OR e.entity_id IN (SELECT access_entity_id FROM ${entities}
        WHERE organization_id = ${scope.organizationId} AND entity_id IN (${ids})))
    AND EXISTS (
      SELECT 1 FROM ${actors}
      JOIN ${entities} actor_entity ON actor_entity.entity_id = ${actors.entityId}
        AND actor_entity.organization_id = ${actors.organizationId}
      WHERE ${actors.organizationId} = ${scope.organizationId}
        AND ${actors.entityId} = ${scope.actorEntityId}
        AND ${activeActorCondition()} AND actor_entity.deleted_at IS NULL
    )
  ORDER BY (e.entity_id <> e.access_entity_id), e.entity_id
  )
  SELECT locked.entity_id AS "entityId", locked.access_entity_id AS "accessEntityId" FROM access_paths path
  CROSS JOIN LATERAL (
    SELECT shared.* FROM (SELECT e.entity_id, e.access_entity_id FROM ${entities} e
      WHERE e.organization_id = ${scope.organizationId} AND e.entity_id = path.entity_id
        AND NOT path.exclusive_lock FOR SHARE OF e) shared
    UNION ALL
    SELECT target.* FROM (SELECT e.entity_id, e.access_entity_id FROM ${entities} e
      WHERE e.organization_id = ${scope.organizationId} AND e.entity_id = path.entity_id
        AND path.exclusive_lock FOR NO KEY UPDATE OF e) target
  ) locked`;
}
