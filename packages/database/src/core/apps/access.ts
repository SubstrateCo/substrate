import {
  coreAppIds,
  optionalAppIds,
  type AppId,
  type OptionalAppId,
} from "@substrate/contracts/apps";

import { AppDisabledError } from "../../errors";
import { organization } from "../organizations/schema";
import type { RepositoryContext } from "../repository-context";
import { organizationApps } from "./schema";
import { and, eq } from "drizzle-orm";

export async function enabledApps(context: RepositoryContext): Promise<AppId[]> {
  const rows = await context.db
    .select({ appId: organizationApps.appId })
    .from(organizationApps)
    .where(
      and(
        eq(organizationApps.organizationId, context.scope.organizationId),
        eq(organizationApps.enabled, true),
      ),
    );
  return [...coreAppIds, ...optionalAppIds.filter((app) => rows.some((row) => row.appId === app))];
}

// Hold this lock in the domain write's transaction until its commit. Settings changes take
// FOR UPDATE on the same organization, including when no app settings rows exist yet.
export async function requireAppEnabled(
  context: RepositoryContext,
  app: OptionalAppId,
  lock = true,
) {
  return requireAppsEnabled(context, [app], lock);
}

export async function requireAppsEnabled(
  context: RepositoryContext,
  apps: OptionalAppId[],
  lock = true,
) {
  if (!apps.length) return;
  if (lock)
    await context.db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, context.scope.organizationId))
      .for("share");
  const enabled = await enabledApps(context);
  if (apps.some((app) => !enabled.includes(app))) throw new AppDisabledError();
}
