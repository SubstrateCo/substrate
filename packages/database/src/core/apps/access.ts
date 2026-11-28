import {
  coreAppIds,
  organizationOptionalAppIds,
  optionalAppIds,
  userAppIds,
  type AppId,
  type OptionalAppId,
} from "@substrate/contracts/apps";

import { AppDisabledError } from "../../errors";
import type { RepositoryContext } from "../repository-context";
import { organizationApps, userApps } from "./schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function enabledApps(
  context: RepositoryContext,
  userId = context.scope.userId,
): Promise<AppId[]> {
  const organization = context.db
    .select({ appId: sql<AppId>`${organizationApps.appId}`.as("app_id") })
    .from(organizationApps)
    .where(
      and(
        eq(organizationApps.organizationId, context.scope.organizationId),
        eq(organizationApps.enabled, true),
        inArray(organizationApps.appId, organizationOptionalAppIds),
      ),
    );
  const rows = userId
    ? await organization.unionAll(
        context.db
          .select({ appId: sql<AppId>`${userApps.appId}`.as("app_id") })
          .from(userApps)
          .where(
            and(
              eq(userApps.organizationId, context.scope.organizationId),
              eq(userApps.userId, userId),
              eq(userApps.enabled, true),
              inArray(userApps.appId, userAppIds),
            ),
          ),
      )
    : await organization;
  return [...coreAppIds, ...optionalAppIds.filter((app) => rows.some((row) => row.appId === app))];
}

export async function requireAppEnabled(context: RepositoryContext, app: OptionalAppId) {
  return requireAppsEnabled(context, [app]);
}

export async function requireAppsEnabled(
  context: RepositoryContext,
  apps: readonly OptionalAppId[],
) {
  if (!apps.length) return;
  const enabled = await enabledApps(context);
  if (apps.some((app) => !enabled.includes(app))) throw new AppDisabledError();
}
