import { changePermission } from "../../../core/permissions/repository";
import type { RepositoryContext, PermissionLevel } from "../../../core/repository-context";
import { recordCrmActivity } from "../activity/activity";
import { requireUnarchivedRecord } from "./record-access";

export function crmSharing(context: RepositoryContext) {
  async function change(entityId: string, actorEntityId: string, level?: PermissionLevel) {
    return context.transaction(async (ctx) => {
      const access = await ctx.requireStructuralAccess(entityId, "owner", {
        type: ["account", "deal"],
      });
      await requireUnarchivedRecord(ctx, access.entity);
      await changePermission(
        ctx,
        access,
        { actorEntityId, level },
        {
          beforeChange: async () => {
            await recordCrmActivity(
              ctx,
              { entityId, action: level ? "shared" : "unshared", changedFields: ["sharing"] },
              access,
            );
          },
        },
      );
      return { entityId };
    });
  }
  return {
    share: (entityId: string, actorEntityId: string, level: PermissionLevel) =>
      change(entityId, actorEntityId, level),
    revoke: (entityId: string, actorEntityId: string) => change(entityId, actorEntityId),
  };
}
