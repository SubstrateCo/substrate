import {
  coreAppIds,
  optionalAppIds,
  type AppId,
  type OptionalAppId,
} from "@substrate/contracts/apps";

import { AppDisabledError } from "../../errors";
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

// Reads the settings without locks. A disable that commits after this read does not stop the
// caller's write; reads hide records of a disabled app.
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
