import { permissionActorEntityId } from "../actors/access";
import { actors } from "../actors/schema";
import { entities, entityType } from "../entities/schema";
import { adminRoleCondition } from "../organizations/roles";
import { member } from "../organizations/schema";
import type { ActorScope, PermissionLevel } from "../repository-context";
import { entityAppsEnabled } from "./app-visibility";
import { entityGrants } from "./schema";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

type ScopeExpression = Pick<ActorScope, "organizationId"> & {
  actorEntityId: string | SQLWrapper;
};

// Organization owners and admins are super users. Actor records are excluded.
// Add a type here only when its domain is shared with the organization.
// A child inherits admin access from its container's type.
const adminEntityTypes = sql.raw(
  (
    [
      "contact",
      "project",
      "task",
      "account",
      "deal",
    ] as const satisfies readonly (typeof entityType.enumValues)[number][]
  )
    .map((type) => `'${type}'`)
    .join(", "),
);

/** Whether admins own entities in a container of this type. */
export function adminSharedType(entityType: SQLWrapper) {
  return sql`${entityType} IN (${adminEntityTypes})`;
}

// Every member of the organization edits entities in a container of these types. Grants on them
// are ignored, so they cannot be shared. Admins still own them.
const memberEditedEntityTypes = [
  "contact",
] as const satisfies readonly (typeof entityType.enumValues)[number][];
const memberEditedTypes = sql.raw(memberEditedEntityTypes.map((type) => `'${type}'`).join(", "));
export function isMemberEdited(type: string) {
  return memberEditedEntityTypes.some((memberEdited) => memberEdited === type);
}

// The role is read on every query, so promotion and demotion take effect at once. Agents resolve to
// their owner's human actor, like grants do.
export function organizationAdminCondition(scope: Parameters<typeof permissionActorEntityId>[0]) {
  return sql`EXISTS (
    SELECT 1 FROM ${actors} oa
    JOIN ${member} om ON om.organization_id = oa.organization_id AND om.user_id = oa.user_id
    WHERE oa.organization_id = ${scope.organizationId} AND oa.entity_id = ${permissionActorEntityId(scope)}
      AND oa.type = 'human' AND oa.disabled_at IS NULL AND ${adminRoleCondition(sql`om.role`)}
  )`;
}

// Any current member, read on every query like the admin role.
function organizationMemberCondition(scope: Parameters<typeof permissionActorEntityId>[0]) {
  return sql`EXISTS (
    SELECT 1 FROM ${actors} ma
    JOIN ${member} mm ON mm.organization_id = ma.organization_id AND mm.user_id = ma.user_id
    WHERE ma.organization_id = ${scope.organizationId} AND ma.entity_id = ${permissionActorEntityId(scope)}
      AND ma.type = 'human' AND ma.disabled_at IS NULL
  )`;
}

// Every entity has an access container: a root is its own container, and a child (a task) uses
// its parent (the project). Grants are set on containers. An entity is visible at the grant's
// level when the entity and its container are live.
function visibleEntitiesQuery(scope: ScopeExpression) {
  return sql`SELECT e.entity_id, g.level FROM ${entityGrants} g
    JOIN ${entities} c ON c.organization_id = g.organization_id AND c.entity_id = g.entity_id
      AND c.deleted_at IS NULL AND c.entity_type NOT IN (${memberEditedTypes})
    JOIN ${entities} e ON e.organization_id = c.organization_id AND e.access_entity_id = c.entity_id
      AND e.deleted_at IS NULL AND ${entityAppsEnabled(scope.organizationId, sql`e.entity_type`)}
    WHERE g.organization_id = ${scope.organizationId} AND g.actor_entity_id = ${permissionActorEntityId(scope)}`;
}

// Entities the actor's grants reach, for list queries. Admin access is not in this set; use
// readableCondition, which adds it per row.
function visibilityCte(scope: ActorScope) {
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
    OR ${adminOwnsCondition(scope, entityId)}
    OR ${memberEditsCondition(scope, entityId, minimum)})`;
}

// Admins own every live entity in a live container of a shared type.
function adminOwnsCondition(scope: ScopeExpression, entityId: SQLWrapper) {
  return sql`(${organizationAdminCondition(scope)} AND EXISTS (
    SELECT 1 FROM ${entities} ae
    JOIN ${entities} ac ON ac.organization_id = ae.organization_id AND ac.entity_id = ae.access_entity_id
      AND ac.deleted_at IS NULL
    WHERE ae.organization_id = ${scope.organizationId} AND ae.entity_id = ${entityId}
      AND ae.deleted_at IS NULL AND ac.entity_type IN (${adminEntityTypes})
      AND ${entityAppsEnabled(scope.organizationId, sql`ae.entity_type`)}
  ))`;
}

// Members edit every live entity in a live container of a member-edited type.
function memberEditsCondition(
  scope: ScopeExpression,
  entityId: SQLWrapper,
  minimum: PermissionLevel,
) {
  if (minimum === "owner") return sql`false`;
  return sql`(${organizationMemberCondition(scope)} AND EXISTS (
    SELECT 1 FROM ${entities} me
    JOIN ${entities} mc ON mc.organization_id = me.organization_id AND mc.entity_id = me.access_entity_id
      AND mc.deleted_at IS NULL
    WHERE me.organization_id = ${scope.organizationId} AND me.entity_id = ${entityId}
      AND me.deleted_at IS NULL AND mc.entity_type IN (${memberEditedTypes})
      AND ${entityAppsEnabled(scope.organizationId, sql`me.entity_type`)}
  ))`;
}

// Whether the actor can read the entity in a list query, at the minimum level. The subquery does
// not depend on the row, so it runs once; admins are checked per row instead of enumerating the
// organization. An actor column instead checks each row's actor.
export function readableCondition(
  scope: ScopeExpression,
  entityId: SQLWrapper,
  minimum: PermissionLevel = "view",
) {
  return sql`(${entityId} IN (SELECT v.entity_id FROM (${visibleEntitiesQuery(scope)}) v
    WHERE v.level >= ${minimum}::permission_level)
    OR ${adminOwnsCondition(scope, entityId)}
    OR ${memberEditsCondition(scope, entityId, minimum)})`;
}

// The actor's strongest level on one entity. It comes from grants on the entity's container, and
// the entity and its container must be live. An admin owns it when its container has a shared
// type, the same check as adminOwnsCondition. A member edits it when its container has a
// member-edited type, whatever grants remain on it.
export function entityAccessLevel(
  scope: Parameters<typeof permissionActorEntityId>[0],
  entityId: SQLWrapper | string,
) {
  return sql`(SELECT CASE WHEN c.entity_type IN (${adminEntityTypes})
      AND ${organizationAdminCondition(scope)} THEN 'owner'::permission_level
    WHEN c.entity_type IN (${memberEditedTypes})
      THEN CASE WHEN ${organizationMemberCondition(scope)} THEN 'edit'::permission_level END
    ELSE g.level END
    FROM ${entities} e
    JOIN ${entities} c ON c.organization_id = e.organization_id AND c.entity_id = e.access_entity_id
      AND c.deleted_at IS NULL
    LEFT JOIN ${entityGrants} g ON g.organization_id = c.organization_id AND g.entity_id = c.entity_id
      AND g.actor_entity_id = ${permissionActorEntityId(scope)}
    WHERE e.organization_id = ${scope.organizationId} AND e.entity_id = ${entityId}
      AND e.deleted_at IS NULL AND ${entityAppsEnabled(scope.organizationId, sql`e.entity_type`)})`;
}
