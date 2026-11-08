import { permissionActorEntityId } from "../actors/access";
import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import { adminRoleCondition } from "../organizations/roles";
import { member } from "../organizations/schema";
import type { ActorScope } from "../repository-context";
import { entityAccessParents } from "./access-parents";
import { entityGrants } from "./schema";
import { sql } from "drizzle-orm";

// Organization owners and admins are super users. People and personal mailbox or calendar
// records are excluded. Add a type here only when its domain is shared with the organization.
const adminEntityTypes = sql.raw(
  `'contact', 'company', 'project', 'task', 'file', 'folder', 'pipeline', 'deal'`,
);

// The role is read on every query, so promotion and demotion take effect at once. Agents resolve to
// their owner's human actor, like grants do.
export function organizationAdminCondition(scope: ActorScope) {
  return sql`EXISTS (
    SELECT 1 FROM ${actors} oa
    JOIN ${member} om ON om.organization_id = oa.organization_id AND om.user_id = oa.user_id
    WHERE oa.organization_id = ${scope.organizationId} AND oa.entity_id = ${permissionActorEntityId(scope)}
      AND oa.type = 'human' AND oa.disabled_at IS NULL AND ${adminRoleCondition(sql`om.role`)}
  )`;
}

export function visibilityCte(scope: ActorScope) {
  return sql`WITH RECURSIVE visible_entities(entity_id, level) AS (
    SELECT g.entity_id, g.level FROM ${entityGrants} g
    JOIN ${entities} e ON e.entity_id = g.entity_id AND e.organization_id = g.organization_id
    WHERE g.organization_id = ${scope.organizationId} AND g.actor_entity_id = ${permissionActorEntityId(scope)}
      AND e.deleted_at IS NULL
    UNION
    SELECT e.entity_id, 'owner'::permission_level FROM ${entities} e
    WHERE e.organization_id = ${scope.organizationId} AND e.deleted_at IS NULL
      AND e.entity_type IN (${adminEntityTypes}) AND ${organizationAdminCondition(scope)}
    UNION
    SELECT p.entity_id, v.level FROM visible_entities v
    JOIN ${entityAccessParents} p ON p.parent_entity_id = v.entity_id AND p.organization_id = ${scope.organizationId}
    JOIN ${entities} e ON e.entity_id = p.entity_id AND e.organization_id = p.organization_id
    WHERE e.deleted_at IS NULL
  )`;
}

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
