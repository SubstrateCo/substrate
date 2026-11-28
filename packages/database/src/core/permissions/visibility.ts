import {
  containerSharing,
  rootTypesWithSharing,
  type ContainerSharing,
  type EntityType,
} from "@substrate/contracts/access/entity-rules";

import { activeActorCondition, permissionActorEntityId } from "../actors/access";
import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { adminRoleCondition } from "../organizations/roles";
import { member } from "../organizations/schema";
import type { ActorScope, PermissionLevel } from "../repository-context";
import { entityAppsEnabled } from "./app-visibility";
import { entityGrants } from "./schema";
import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type ScopeExpression = Parameters<typeof permissionActorEntityId>[0];

function typeList(types: readonly EntityType[]) {
  return sql.raw(types.length ? types.map((type) => `'${type}'`).join(", ") : "NULL");
}
const adminOwnedTypes = typeList(rootTypesWithSharing("admins", "members"));
const memberEditedTypes = typeList(rootTypesWithSharing("members"));

export function isMemberEdited(type: EntityType) {
  return containerSharing(type) === "members";
}

function organizationMemberCondition(scope: ScopeExpression, { admin }: { admin: boolean }) {
  return sql`EXISTS (
    SELECT 1 FROM ${actors} oa
    JOIN ${member} om ON om.organization_id = oa.organization_id AND om.user_id = oa.user_id
    WHERE oa.organization_id = ${scope.organizationId} AND oa.entity_id = ${permissionActorEntityId(scope)}
      AND oa.type = 'human' AND oa.disabled_at IS NULL
      ${admin ? sql`AND ${adminRoleCondition(sql`om.role`)}` : sql``}
  )`;
}

const scopeActor = alias(actors, "scope_actor");
export function activeScopeActorCondition(scope: ScopeExpression) {
  return sql`EXISTS (
    SELECT 1 FROM ${actors} scope_actor
    JOIN ${entities} scope_actor_entity ON scope_actor_entity.organization_id = scope_actor.organization_id
      AND scope_actor_entity.entity_id = scope_actor.entity_id AND scope_actor_entity.deleted_at IS NULL
    WHERE scope_actor.organization_id = ${scope.organizationId}
      AND scope_actor.entity_id = ${scope.actorEntityId}::uuid AND ${activeActorCondition(scopeActor)}
  )`;
}

export function organizationAdminCondition(scope: ScopeExpression) {
  return organizationMemberCondition(scope, { admin: true });
}

function visibleEntitiesQuery(scope: ScopeExpression, type?: EntityType) {
  return sql`SELECT e.entity_id, g.level FROM ${entityGrants} g
    JOIN ${entities} c ON c.organization_id = g.organization_id AND c.entity_id = g.entity_id
      AND c.deleted_at IS NULL AND c.entity_type NOT IN (${memberEditedTypes})
    JOIN ${entities} e ON e.organization_id = c.organization_id AND e.access_entity_id = c.entity_id
      AND e.deleted_at IS NULL AND ${entityAppsEnabled(scope.organizationId, sql`e.entity_type`)}
      ${type ? sql`AND e.entity_type = ${type}` : sql``}
    WHERE g.organization_id = ${scope.organizationId} AND g.actor_entity_id = ${permissionActorEntityId(scope)}`;
}

function visibilityCte(scope: ActorScope) {
  return sql`WITH visible_entities(entity_id, level) AS (${visibleEntitiesQuery(scope)})`;
}

export function withVisibility(scope: ActorScope, query: SQL) {
  return sql`${visibilityCte(scope)} ${query}`;
}

function roleReachesCondition(
  scope: ScopeExpression,
  entityId: SQLWrapper,
  admin: boolean,
  containerTypes: SQL,
  type?: EntityType,
) {
  return sql`(${organizationMemberCondition(scope, { admin })} AND EXISTS (
    SELECT 1 FROM ${entities} re
    JOIN ${entities} rc ON rc.organization_id = re.organization_id AND rc.entity_id = re.access_entity_id
      AND rc.deleted_at IS NULL
    WHERE re.organization_id = ${scope.organizationId} AND re.entity_id = ${entityId}
      AND re.deleted_at IS NULL AND rc.entity_type IN (${containerTypes})
      ${type ? sql`AND re.entity_type = ${type}` : sql``}
      AND ${entityAppsEnabled(scope.organizationId, sql`re.entity_type`)}
  ))`;
}

function readableFrom(
  visible: SQL,
  scope: ScopeExpression,
  entityId: SQLWrapper,
  minimum: PermissionLevel,
  type?: EntityType,
) {
  const sharing: ContainerSharing[] = type
    ? [containerSharing(type)]
    : ["grants", "admins", "members"];
  const branches: SQL[] = [];
  if (sharing.includes("grants") || sharing.includes("admins"))
    branches.push(
      sql`${entityId} IN (SELECT entity_id FROM ${visible} WHERE level >= ${minimum}::permission_level)`,
    );
  if (sharing.includes("admins") || (sharing.includes("members") && minimum === "owner"))
    branches.push(roleReachesCondition(scope, entityId, true, adminOwnedTypes, type));
  if (sharing.includes("members") && minimum !== "owner")
    branches.push(roleReachesCondition(scope, entityId, false, memberEditedTypes, type));
  return sql`(${activeScopeActorCondition(scope)} AND (${sql.join(branches, sql` OR `)}))`;
}

export function readableFromCte(
  scope: ActorScope,
  entityId: SQLWrapper,
  minimum: PermissionLevel = "view",
) {
  return readableFrom(sql`visible_entities`, scope, entityId, minimum);
}

export function readableCondition(
  scope: ScopeExpression,
  entityId: SQLWrapper,
  minimum: PermissionLevel = "view",
  type?: EntityType,
) {
  return readableFrom(
    sql`(${visibleEntitiesQuery(scope, type)}) v`,
    scope,
    entityId,
    minimum,
    type,
  );
}

export function entityReaders(organizationId: string | SQLWrapper, entityId: SQLWrapper | string) {
  return sql`SELECT ra.entity_id FROM ${actors} ra
    JOIN ${member} rm ON rm.organization_id = ra.organization_id AND rm.user_id = ra.user_id
    JOIN ${entities} re ON re.organization_id = ra.organization_id AND re.entity_id = ${entityId}
      AND re.deleted_at IS NULL AND ${entityAppsEnabled(organizationId, sql`re.entity_type`)}
    JOIN ${entities} rc ON rc.organization_id = re.organization_id AND rc.entity_id = re.access_entity_id
      AND rc.deleted_at IS NULL
    WHERE ra.organization_id = ${organizationId} AND ra.type = 'human' AND ra.disabled_at IS NULL
      AND ((rc.entity_type IN (${adminOwnedTypes}) AND ${adminRoleCondition(sql`rm.role`)})
        OR rc.entity_type IN (${memberEditedTypes})
        OR EXISTS (SELECT 1 FROM ${entityGrants} rg WHERE rg.organization_id = rc.organization_id
          AND rg.entity_id = rc.entity_id AND rg.actor_entity_id = ra.entity_id))`;
}

export function entityAccessLevel(
  scope: ScopeExpression,
  entityId: SQLWrapper | string,
  { apps = true }: { apps?: boolean } = {},
) {
  return sql`(SELECT CASE WHEN c.entity_type IN (${adminOwnedTypes})
      AND ${organizationAdminCondition(scope)} THEN 'owner'::permission_level
    WHEN c.entity_type IN (${memberEditedTypes})
      THEN CASE WHEN ${organizationMemberCondition(scope, { admin: false })} THEN 'edit'::permission_level END
    ELSE g.level END
    FROM ${entities} e
    JOIN ${entities} c ON c.organization_id = e.organization_id AND c.entity_id = e.access_entity_id
      AND c.deleted_at IS NULL
    LEFT JOIN ${entityGrants} g ON g.organization_id = c.organization_id AND g.entity_id = c.entity_id
      AND g.actor_entity_id = ${permissionActorEntityId(scope)}
    WHERE e.organization_id = ${scope.organizationId} AND e.entity_id = ${entityId}
      AND e.deleted_at IS NULL
      ${apps ? sql`AND ${entityAppsEnabled(scope.organizationId, sql`e.entity_type`)}` : sql``})`;
}
