import {
  organizationOptionalAppIds,
  updateApps,
  updateUserApp,
  type AppSettings,
} from "@substrate/contracts/apps";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { AccessDeniedError, ValidationError } from "../../errors";
import { adminRoleCondition } from "../organizations/roles";
import { member } from "../organizations/schema";
import type { RepositoryContext } from "../repository-context";
import type { SessionIdentity } from "../session/identity";
import { enabledApps } from "./access";
import { organizationApps, userApps } from "./schema";
import { and, eq, sql } from "drizzle-orm";
import type { z } from "zod";

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
    return {
      organizationId: identity.organizationId,
      enabledApps: await enabledApps(context, identity.userId),
    };
  }

  return {
    get,
    async update(apps: AppSettings["enabledApps"]): Promise<AppSettings> {
      const parsed = updateApps.safeParse({
        organizationId: identity.organizationId,
        enabledApps: apps,
      });
      if (!parsed.success) throw new ValidationError("Invalid app settings.");
      const values = sql.join(
        organizationOptionalAppIds.map(
          (appId) => sql`(${appId}::text, ${apps.includes(appId)}::boolean)`,
        ),
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
      return get();
    },
    async updateUserApp(
      input: Pick<z.output<typeof updateUserApp>, "appId" | "enabled">,
    ): Promise<AppSettings> {
      const parsed = updateUserApp.safeParse({ ...input, organizationId: identity.organizationId });
      if (!parsed.success) throw new ValidationError("Invalid personal app settings.");
      const { appId, enabled } = parsed.data;
      const written = await context.db.execute(sql`
        INSERT INTO ${userApps} (organization_id, user_id, app_id, enabled)
        SELECT ${identity.organizationId}, ${identity.userId}, ${appId}, ${enabled}
        WHERE EXISTS (
          SELECT 1 FROM ${member}
          WHERE ${member.organizationId} = ${identity.organizationId}
            AND ${member.userId} = ${identity.userId}
        )
        ON CONFLICT (organization_id, user_id, app_id) DO UPDATE SET enabled = excluded.enabled
        RETURNING app_id
      `);
      if (!written.length) throw new AccessDeniedError();
      context.effects.hint({ audience: realtimeKeys.user(identity.userId), domain: "apps" });
      return get();
    },
  };
}
