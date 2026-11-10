import { ValidationError } from "../../errors";
import { RepositoryContext, type PermissionLevel } from "../repository-context";
import { entityGrants, permissionLevel } from "./schema";
import { inheritedOwnerQuery } from "./visibility";
import { and, eq, sql } from "drizzle-orm";

export function permissionRepository(context: RepositoryContext) {
  const { scope, db } = context;

  async function change(input: {
    entityId: string;
    actorEntityId: string;
    level?: PermissionLevel;
  }) {
    await db.transaction(async (tx) => {
      const ctx = new RepositoryContext(tx, scope);
      await ctx.requireAccess(input.entityId, "owner", true);
      if (input.level) {
        const target = await ctx.requireActiveActor(input.actorEntityId);
        if (target.type !== "human")
          throw new ValidationError(
            "Agents use their owner's access. Share with the owner instead.",
          );
      }
      const target = and(
        eq(entityGrants.organizationId, scope.organizationId),
        eq(entityGrants.entityId, input.entityId),
        eq(entityGrants.actorEntityId, input.actorEntityId),
      );
      const [existing] = await tx
        .select({ level: entityGrants.level })
        .from(entityGrants)
        .where(target);
      if (existing?.level === "owner" && input.level !== "owner") {
        const [owners] = await tx.execute<{ remaining: boolean }>(sql`
          SELECT EXISTS (
            SELECT 1 FROM ${entityGrants}
            WHERE ${entityGrants.organizationId} = ${scope.organizationId}
              AND ${entityGrants.entityId} = ${input.entityId}
              AND ${entityGrants.level} = 'owner'
              AND ${entityGrants.actorEntityId} <> ${input.actorEntityId}
          ) OR EXISTS (${inheritedOwnerQuery(scope, input.entityId)}) AS remaining
        `);
        if (!owners?.remaining)
          throw new ValidationError("Cannot remove or downgrade the last owner.");
      }
      if (input.level) {
        await tx
          .insert(entityGrants)
          .values({
            organizationId: scope.organizationId,
            entityId: input.entityId,
            actorEntityId: input.actorEntityId,
            level: input.level,
          })
          .onConflictDoUpdate({
            target: [
              entityGrants.organizationId,
              entityGrants.entityId,
              entityGrants.actorEntityId,
            ],
            set: { level: input.level },
          });
      } else {
        await tx.delete(entityGrants).where(target);
      }
    });
  }

  return {
    grant(input: { entityId: string; actorEntityId: string; level: PermissionLevel }) {
      if (!permissionLevel.enumValues.includes(input.level))
        throw new ValidationError("Unknown permission level.");
      return change({
        entityId: input.entityId,
        actorEntityId: input.actorEntityId,
        level: input.level,
      });
    },
    revoke(input: { entityId: string; actorEntityId: string }) {
      return change({ entityId: input.entityId, actorEntityId: input.actorEntityId });
    },
  };
}
