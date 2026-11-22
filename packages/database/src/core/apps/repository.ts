import {
  coreAppIds,
  optionalAppIds,
  updateApps,
  type AppSettings,
} from "@substrate/contracts/apps";

import { AccessDeniedError, ValidationError } from "../../errors";
import { member, organization } from "../organizations/schema";
import type { RepositoryContext } from "../repository-context";
import type { SessionIdentity } from "../session/identity";
import { enabledApps } from "./access";
import { organizationApps } from "./schema";
import { and, eq } from "drizzle-orm";

export function appRepository(context: RepositoryContext, identity: SessionIdentity) {
  async function membership(lock = false) {
    const query = context.db
      .select({ role: member.role })
      .from(member)
      .where(
        and(eq(member.organizationId, identity.organizationId), eq(member.userId, identity.userId)),
      );
    const [row] = await (lock ? query.for("share") : query);
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
      await context.db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, identity.organizationId))
        .for("update");
      const { role } = await membership(true);
      if (!role.split(",").some((value) => ["owner", "admin"].includes(value.trim())))
        throw new AccessDeniedError();
      for (const appId of optionalAppIds) {
        const enabled = apps.includes(appId);
        await context.db
          .insert(organizationApps)
          .values({ organizationId: identity.organizationId, appId, enabled })
          .onConflictDoUpdate({
            target: [organizationApps.organizationId, organizationApps.appId],
            set: { enabled },
          });
      }
      return {
        organizationId: identity.organizationId,
        enabledApps: [...coreAppIds, ...optionalAppIds.filter((app) => apps.includes(app))],
      };
    },
  };
}
