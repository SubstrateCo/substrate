import { entities } from "../../core/entities/schema";
import type { ActorScope } from "../../core/repository-context";
import { tasks } from "./tasks.schema";
import { and, eq, sql, type SQLWrapper } from "drizzle-orm";

// For listing a project's tasks after checking the project: excludes deleted tasks. Check one
// task's access on the task entity itself; it inherits its project's level while live.
export function liveTask(entityId: SQLWrapper = tasks.entityId) {
  return sql`EXISTS (SELECT 1 FROM ${entities} lt
    WHERE lt.organization_id = ${tasks.organizationId} AND lt.entity_id = ${entityId}
      AND lt.deleted_at IS NULL)`;
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
