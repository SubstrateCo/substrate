import { realtimeKeys } from "@substrate/contracts/realtime";

import { ValidationError } from "../../errors";
import { RepositoryContext, type LockedAccess, type PermissionLevel } from "../repository-context";
import { entityGrants, permissionLevel } from "./schema";
import { isMemberEdited } from "./visibility";
import { and, eq, sql } from "drizzle-orm";

// Untyped callers reach grants too; an unknown level must not be stored or read as a revoke.
export function requirePermissionLevel(level: PermissionLevel) {
  if (!permissionLevel.enumValues.includes(level))
    throw new ValidationError("Unknown permission level.");
}

/**
 * Sets or removes (no `level`) one actor's grant on the locked entity. `access` must come from
 * `ctx.requireAccess(entityId, "owner", true, "structural")` in the same transaction as `ctx`.
 */
export async function changePermission(
  ctx: RepositoryContext,
  access: LockedAccess<"owner">,
  input: { actorEntityId: string; level?: PermissionLevel },
) {
  const { db: tx, scope } = ctx;
  const { entity } = access;
  const entityId = entity.entityId;
  if (entity.accessEntityId !== entityId)
    throw new ValidationError("This record inherits its access. Share its parent instead.");
  if (isMemberEdited(entity.entityType))
    throw new ValidationError("Everyone in the organization can already edit this record.");
  if (input.level) {
    const target = await ctx.requireActiveActor(input.actorEntityId);
    if (target.type !== "human")
      throw new ValidationError("Agents use their owner's access. Share with the owner instead.");
  }
  const target = and(
    eq(entityGrants.organizationId, scope.organizationId),
    eq(entityGrants.entityId, entityId),
    eq(entityGrants.actorEntityId, input.actorEntityId),
  );
  const [existing] = await tx
    .select({ level: entityGrants.level })
    .from(entityGrants)
    .where(target);
  if (existing?.level === input.level) return;
  if (existing?.level === "owner") {
    const [owners] = await tx.execute<{ remaining: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM ${entityGrants}
        WHERE ${entityGrants.organizationId} = ${scope.organizationId}
          AND ${entityGrants.entityId} = ${entityId}
          AND ${entityGrants.level} = 'owner'
          AND ${entityGrants.actorEntityId} <> ${input.actorEntityId}
      ) AS remaining
    `);
    if (!owners?.remaining) throw new ValidationError("Cannot remove or downgrade the last owner.");
  }
  if (input.level) {
    await tx
      .insert(entityGrants)
      .values({
        organizationId: scope.organizationId,
        entityId,
        actorEntityId: input.actorEntityId,
        level: input.level,
      })
      .onConflictDoUpdate({
        target: [entityGrants.organizationId, entityGrants.entityId, entityGrants.actorEntityId],
        set: { level: input.level },
      });
  } else {
    await tx.delete(entityGrants).where(target);
  }
  ctx.effects.hint({
    audience: realtimeKeys.actor(scope.organizationId, input.actorEntityId),
    domain: "access",
  });
  ctx.effects.hint({
    audience: realtimeKeys.organization(scope.organizationId),
    domain: entity.entityType === "project" ? "tasks" : "access",
  });
}

export function permissionRepository(context: RepositoryContext) {
  function change(input: { entityId: string; actorEntityId: string; level?: PermissionLevel }) {
    return context.transaction(async (ctx) => {
      const access = await ctx.requireAccess(input.entityId, "owner", true, "structural");
      await changePermission(ctx, access, input);
    });
  }

  return {
    grant(input: { entityId: string; actorEntityId: string; level: PermissionLevel }) {
      requirePermissionLevel(input.level);
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
