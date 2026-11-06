import { RepositoryContext, pageSize } from "../repository-context";
import { entityLinks } from "./schema";
import { and, asc, eq, inArray, or } from "drizzle-orm";

type LinkInput = Pick<
  typeof entityLinks.$inferInsert,
  "sourceEntityId" | "targetEntityId" | "relationType"
>;

export function linkRepository(context: RepositoryContext) {
  const { scope, db } = context;
  return {
    async create(input: LinkInput) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(input.sourceEntityId, "edit", true);
        await ctx.requireAccess(input.targetEntityId, "view");
        const [link] = await tx
          .insert(entityLinks)
          .values({
            organizationId: scope.organizationId,
            sourceEntityId: input.sourceEntityId,
            targetEntityId: input.targetEntityId,
            relationType: input.relationType,
            createdByActorEntityId: scope.actorEntityId,
          })
          .returning();
        return link!;
      });
    },

    async list(entityId: string, options: { limit?: number } = {}) {
      await context.requireAccess(entityId, "view");
      return db
        .select()
        .from(entityLinks)
        .where(
          and(
            eq(entityLinks.organizationId, scope.organizationId),
            or(eq(entityLinks.sourceEntityId, entityId), eq(entityLinks.targetEntityId, entityId)),
            inArray(entityLinks.sourceEntityId, context.readableEntities()),
            inArray(entityLinks.targetEntityId, context.readableEntities()),
          ),
        )
        .orderBy(
          asc(entityLinks.sourceEntityId),
          asc(entityLinks.targetEntityId),
          asc(entityLinks.relationType),
        )
        .limit(pageSize(options.limit));
    },

    async remove(input: LinkInput) {
      await db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(input.sourceEntityId, "edit", true);
        await ctx.requireAccess(input.targetEntityId, "view");
        await tx
          .delete(entityLinks)
          .where(
            and(
              eq(entityLinks.organizationId, scope.organizationId),
              eq(entityLinks.sourceEntityId, input.sourceEntityId),
              eq(entityLinks.targetEntityId, input.targetEntityId),
              eq(entityLinks.relationType, input.relationType),
            ),
          );
      });
    },
  };
}
