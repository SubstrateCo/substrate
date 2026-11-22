import { ValidationError, mapPostgresError } from "../../errors";
import { RepositoryContext, pageSize, type EntityAccess } from "../repository-context";
import { entityLinks } from "./schema";
import { and, asc, eq, or, sql } from "drizzle-orm";

/** A `related_to` link connects two entities in no direction. It is stored in ID order. */
export function relatedPair(entityId: string, otherEntityId: string) {
  return entityId < otherEntityId
    ? { sourceEntityId: entityId, targetEntityId: otherEntityId }
    : { sourceEntityId: otherEntityId, targetEntityId: entityId };
}

// `entityId` is the record being edited; `otherEntityId` only needs to be readable.
type RelatedInput = { entityId: string; otherEntityId: string };

/** Generic `related_to` links. Task relations (`blocks`, `duplicates`) belong to the task domain. */
export function linkRepository(context: RepositoryContext) {
  const { scope, db } = context;
  return {
    async create(input: RelatedInput) {
      return db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(input.entityId, "edit");
        await ctx.requireAccess(input.otherEntityId, "view");
        if (input.entityId === input.otherEntityId)
          throw new ValidationError("Cannot link a record to itself.");
        const [link] = await tx
          .insert(entityLinks)
          .values({
            organizationId: scope.organizationId,
            ...relatedPair(input.entityId, input.otherEntityId),
            relationType: "related_to",
            createdByActorEntityId: scope.actorEntityId,
          })
          .returning()
          .catch((error: Error) =>
            mapPostgresError(error, {
              uniqueConstraint: { entity_links_pair_unique: "These records are already linked." },
            }),
          );
        return link!;
      });
    },

    /** `checked` is the caller's view access to `entityId`, already read in this context. */
    async list(entityId: string, options: { limit?: number } = {}, checked?: EntityAccess) {
      if (checked?.entity.entityId !== entityId) await context.requireAccess(entityId, "view");
      return db
        .select()
        .from(entityLinks)
        .where(
          and(
            eq(entityLinks.organizationId, scope.organizationId),
            or(eq(entityLinks.sourceEntityId, entityId), eq(entityLinks.targetEntityId, entityId)),
            // The requested endpoint is checked above; check the other one.
            context.readable(
              sql`CASE WHEN ${entityLinks.sourceEntityId} = ${entityId}
                THEN ${entityLinks.targetEntityId} ELSE ${entityLinks.sourceEntityId} END`,
            ),
          ),
        )
        .orderBy(
          asc(entityLinks.sourceEntityId),
          asc(entityLinks.targetEntityId),
          asc(entityLinks.relationType),
        )
        .limit(pageSize(options.limit));
    },

    async remove(input: RelatedInput) {
      await db.transaction(async (tx) => {
        const ctx = new RepositoryContext(tx, scope);
        await ctx.requireAccess(input.entityId, "edit");
        await ctx.requireAccess(input.otherEntityId, "view");
        const pair = relatedPair(input.entityId, input.otherEntityId);
        await tx
          .delete(entityLinks)
          .where(
            and(
              eq(entityLinks.organizationId, scope.organizationId),
              eq(entityLinks.sourceEntityId, pair.sourceEntityId),
              eq(entityLinks.targetEntityId, pair.targetEntityId),
              eq(entityLinks.relationType, "related_to"),
            ),
          );
      });
    },
  };
}
