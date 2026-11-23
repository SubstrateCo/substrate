import { entities } from "../../core/entities/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { ValidationError } from "../../errors";
import { projects } from "./schema";
import { and, eq, inArray, isNotNull, sql, type SQLWrapper } from "drizzle-orm";

export const archivedProjectMessage = "Restore the project first.";

/** The entity in `entityId` is an archived project or belongs to one. */
export function inArchivedProject(organizationId: string | SQLWrapper, entityId: SQLWrapper) {
  return sql`EXISTS (SELECT 1 FROM ${entities} ae
    JOIN ${projects} ap ON ap.organization_id = ae.organization_id
      AND ap.entity_id = ae.access_entity_id AND ap.archived_at IS NOT NULL
    WHERE ae.organization_id = ${organizationId} AND ae.entity_id = ${entityId})`;
}

/**
 * Rejects a write to an archived project or to a record in one. Check access first, so the error
 * reaches only readers who may see the project.
 */
export async function requireUnarchived(ctx: RepositoryContext, entityIds: string[]) {
  const ids = [...new Set(entityIds)];
  if (!ids.length) return;
  const [archived] = await ctx.db
    .select({ entityId: entities.entityId })
    .from(entities)
    .innerJoin(
      projects,
      and(
        eq(projects.organizationId, entities.organizationId),
        eq(projects.entityId, entities.accessEntityId),
      ),
    )
    .where(
      and(
        eq(entities.organizationId, ctx.scope.organizationId),
        inArray(entities.entityId, ids),
        isNotNull(projects.archivedAt),
      ),
    )
    .limit(1);
  if (archived) throw new ValidationError(archivedProjectMessage);
}
