import { ValidationError } from "../../errors";
import { RepositoryContext } from "../repository-context";
import { entities } from "./schema";
import { and, eq } from "drizzle-orm";

export function entityRepository(context: RepositoryContext) {
  return {
    async get(entityId: string) {
      return (await context.requireAccess(entityId, "view")).entity;
    },

    async softDelete(entityId: string) {
      return context.db.transaction(async (tx) => {
        const { entity } = await new RepositoryContext(tx, context.scope).requireAccess(
          entityId,
          "owner",
          true,
        );
        if (entity.entityType === "actor")
          throw new ValidationError("Disable actors instead of deleting them.");
        await tx
          .update(entities)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(entities.organizationId, context.scope.organizationId),
              eq(entities.entityId, entityId),
            ),
          );
      });
    },
  };
}
