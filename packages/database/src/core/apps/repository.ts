import {
  coreAppIds,
  optionalAppIds,
  updateApps,
  type AppSettings,
} from "@substrate/contracts/apps";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { AccessDeniedError, ValidationError } from "../../errors";
import { adminRoleCondition } from "../organizations/roles";
import { member } from "../organizations/schema";
import type { RepositoryContext } from "../repository-context";
import type { SessionIdentity } from "../session/identity";
import { enabledApps } from "./access";
import { organizationApps } from "./schema";
import { and, eq, sql } from "drizzle-orm";

export function appRepository(context: RepositoryContext, identity: SessionIdentity) {
  async function membership() {
    const [row] = await context.db
      .select({ role: member.role })
      .from(member)
      .where(
        and(eq(member.organizationId, identity.organizationId), eq(member.userId, identity.userId)),
      );
    if (!row) throw new AccessDeniedError();
    return row;
  }

  async function get(): Promise<AppSettings> {
    await membership();
    return { organizationId: identity.organizationId, enabledApps: await enabledApps(context) };
  }

  return {
    get,
    async update(apps: AppSettings["enabledApps"]): Promise<AppSettings> {
      const parsed = updateApps.safeParse({
        organizationId: identity.organizationId,
        enabledApps: apps,
      });
      if (!parsed.success) throw new ValidationError("Invalid app settings.");
      // One statement writes every app, and only for an owner or admin. Concurrent updates write
      // the rows in the same order, so the settings always match one whole update.
      const values = sql.join(
        optionalAppIds.map((appId) => sql`(${appId}::text, ${apps.includes(appId)}::boolean)`),
        sql`, `,
      );
      const written = await context.db.execute(sql`
        INSERT INTO ${organizationApps} (organization_id, app_id, enabled)
        SELECT ${identity.organizationId}, app.app_id, app.enabled
        FROM (VALUES ${values}) AS app(app_id, enabled)
        WHERE EXISTS (
          SELECT 1 FROM ${member}
          WHERE ${member.organizationId} = ${identity.organizationId}
            AND ${member.userId} = ${identity.userId}
            AND ${adminRoleCondition(member.role)}
        )
        ON CONFLICT (organization_id, app_id) DO UPDATE SET enabled = excluded.enabled
        RETURNING app_id
      `);
      if (!written.length) throw new AccessDeniedError();
      context.effects.hint({
        audience: realtimeKeys.organization(identity.organizationId),
        domain: "organization",
      });
      return {
        organizationId: identity.organizationId,
        enabledApps: [...coreAppIds, ...optionalAppIds.filter((app) => apps.includes(app))],
      };
    },
  };
}
