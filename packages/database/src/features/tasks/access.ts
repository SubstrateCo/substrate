import { entities } from "../../core/entities/schema";
import type { ActorScope, RepositoryContext } from "../../core/repository-context";
import { tasks } from "./tasks.schema";
import { and, eq, sql, type SQLWrapper } from "drizzle-orm";

export function liveTask(entityId: SQLWrapper = tasks.entityId) {
  return sql`EXISTS (SELECT 1 FROM ${entities} lt
    WHERE lt.organization_id = ${tasks.organizationId} AND lt.entity_id = ${entityId}
      AND lt.deleted_at IS NULL)`;
}

/**
 * Marks a new assignee or subtask in the project. Revocation, moves and deletion depend on these
 * rows and claim the same version by compare-and-set, so the one that comes second sees the
 * other: this call waits for a structural change in flight, and a later one fails its claim.
 * Read the assignee's access or the parent task after this call.
 */
export async function claimProjectChange(ctx: RepositoryContext, projectEntityId: string) {
  await ctx.db
    .update(entities)
    .set({ accessVersion: sql`${entities.accessVersion} + 1` })
    .where(
      and(
        eq(entities.organizationId, ctx.scope.organizationId),
        eq(entities.entityId, projectEntityId),
      ),
    );
}

export function liveProjectTasks(
  scope: Pick<ActorScope, "organizationId">,
  projectEntityId: string,
) {
  return and(
    eq(tasks.organizationId, scope.organizationId),
    eq(tasks.projectEntityId, projectEntityId),
    liveTask(),
  );
}
