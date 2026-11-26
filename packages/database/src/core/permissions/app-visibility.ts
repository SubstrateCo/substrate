import { coreAppIds, requiredAppsForEntityType, type AppId } from "@substrate/contracts/apps";

import { organizationApps } from "../apps/schema";
import { entityType } from "../entities/schema";
import { sql, type SQLWrapper } from "drizzle-orm";

export function appEnabledCondition(organizationId: string | SQLWrapper, app: AppId) {
  if (coreAppIds.some((core) => core === app)) return sql`true`;
  return sql`EXISTS (
    SELECT 1 FROM ${organizationApps} app_access
    WHERE app_access.organization_id = ${organizationId}
      AND app_access.app_id = ${app} AND app_access.enabled
  )`;
}

/** App access is separate from grants, including an administrator's implicit ownership. */
export function entityAppsEnabled(organizationId: string | SQLWrapper, type: SQLWrapper) {
  const gated = entityType.enumValues.flatMap((value) => {
    const apps = requiredAppsForEntityType(value);
    if (!apps.length) return [];
    return [
      sql`(${type} <> ${value} OR (${sql.join(
        apps.map((app) => appEnabledCondition(organizationId, app)),
        sql` AND `,
      )}))`,
    ];
  });
  return gated.length ? sql`(${sql.join(gated, sql` AND `)})` : sql`true`;
}
