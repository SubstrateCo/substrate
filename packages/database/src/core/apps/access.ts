import {
  coreAppIds,
  optionalAppIds,
  type AppId,
  type OptionalAppId,
} from "@substrate/contracts/apps";

import { AccessDeniedError, AppDisabledError } from "../../errors";
import { activeActorCondition } from "../actors/access";
import { actors } from "../actors/schema";
import { entities } from "../entities/schema";
import type { RepositoryContext } from "../repository-context";
import { organizationApps } from "./schema";
import { and, eq, exists, isNull, sql } from "drizzle-orm";

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

export async function requireAppsEnabled(context: RepositoryContext, apps: OptionalAppId[]) {
  if (!apps.length) return;
  const enabled = await enabledApps(context);
  if (apps.some((app) => !enabled.includes(app))) throw new AppDisabledError();
}

// requireAppEnabled(context, app) then context.requireActiveActor(), in one statement.
export async function requireAppEnabledForActiveActor(
  context: RepositoryContext,
  app: OptionalAppId,
) {
  const { organizationId, actorEntityId } = context.scope;
  const enabled = context.db
    .select({ one: sql`1` })
    .from(organizationApps)
    .where(
      and(
        eq(organizationApps.organizationId, organizationId),
        eq(organizationApps.enabled, true),
        eq(organizationApps.appId, app),
      ),
    );
  const active = context.db
    .select({ one: sql`1` })
    .from(actors)
    .innerJoin(
      entities,
      and(
        eq(entities.entityId, actors.entityId),
        eq(entities.organizationId, actors.organizationId),
      ),
    )
    .where(
      and(
        eq(actors.organizationId, organizationId),
        eq(actors.entityId, actorEntityId),
        activeActorCondition(),
        isNull(entities.deletedAt),
      ),
    );
  const [row] = await context.db.execute<{ enabled: boolean; active: boolean }>(
    sql`select ${exists(enabled)} as enabled, ${exists(active)} as active`,
  );
  if (!row?.enabled) throw new AppDisabledError();
  if (!row.active) throw new AccessDeniedError();
}
