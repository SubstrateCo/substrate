import { ValidationError } from "../../errors";
import { actors } from "../actors/schema";
import { RepositoryContext, type PermissionLevel } from "../repository-context";
import { entityGrants, permissionLevel } from "./schema";
import { inheritedOwnerQuery } from "./visibility";
import { and, eq } from "drizzle-orm";

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
        await ctx.requireActiveActor(input.actorEntityId);
        const [targetActor] = await tx
          .select({ type: actors.type })
          .from(actors)
          .where(
            and(
              eq(actors.organizationId, scope.organizationId),
              eq(actors.entityId, input.actorEntityId),
            ),
          );
        if (targetActor?.type === "agent")
          throw new ValidationError("Agents use their owner's permissions.");
      }
      const target = and(
        eq(entityGrants.organizationId, scope.organizationId),
        eq(entityGrants.entityId, input.entityId),
        eq(entityGrants.actorEntityId, input.actorEntityId),
      );
      const [existing] = await tx.select().from(entityGrants).where(target);
      if (existing?.level === "owner" && input.level !== "owner") {
        const owners = await tx
          .select()
          .from(entityGrants)
          .where(
            and(
              eq(entityGrants.organizationId, scope.organizationId),
              eq(entityGrants.entityId, input.entityId),
              eq(entityGrants.level, "owner"),
            ),
          );
        const [inheritedOwner] = await tx.execute<{ present: number }>(
          inheritedOwnerQuery(scope, input.entityId),
        );
        if (owners.length === 1 && !inheritedOwner)
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
    async getEffectiveLevel(entityId: string) {
      return (await context.requireAccess(entityId, "view")).level;
    },
    async require(entityId: string, minimum: PermissionLevel) {
      await context.requireAccess(entityId, minimum);
    },
  };
}
