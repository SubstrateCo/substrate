import { requireAppEnabled } from "../../core/apps/access";
import { changePermission, requirePermissionLevel } from "../../core/permissions/repository";
import { entityGrants } from "../../core/permissions/schema";
import type { RepositoryContext, PermissionLevel } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { recordCrmActivity } from "./activity";
import { and, eq } from "drizzle-orm";

export function crmSharing(context: RepositoryContext) {
  async function change(entityId: string, actorEntityId: string, level?: PermissionLevel) {
    return context.transaction(async (ctx) => {
      await requireAppEnabled(ctx, "crm");
      const access = await ctx.requireAccess(entityId, "owner", true, "structural");
      const { entity } = access;
      if (!["account", "deal"].includes(entity.entityType)) throw new AccessDeniedError();
      const [previous] = await ctx.db
        .select({ level: entityGrants.level })
        .from(entityGrants)
        .where(
          and(
            eq(entityGrants.organizationId, ctx.scope.organizationId),
            eq(entityGrants.entityId, entityId),
            eq(entityGrants.actorEntityId, actorEntityId),
          ),
        );
      // Record under the locked authorization before a self-revoke removes access. The
      // enclosing transaction rolls this back if changing the grant fails.
      if (previous?.level !== level)
        await recordCrmActivity(
          ctx,
          {
            entityId,
            action: level ? "shared" : "unshared",
            changedFields: ["sharing"],
          },
          access,
        );
      if (level) {
        requirePermissionLevel(level);
        await changePermission(ctx, access, { actorEntityId, level });
      } else await changePermission(ctx, access, { actorEntityId });
      return { entityId };
    });
  }
  return {
    share: (entityId: string, actorEntityId: string, level: PermissionLevel) =>
      change(entityId, actorEntityId, level),
    revoke: (entityId: string, actorEntityId: string) => change(entityId, actorEntityId),
  };
}
