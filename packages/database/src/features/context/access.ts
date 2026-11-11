import { taskStatusLabels } from "@substrate/contracts/tasks";

import type { RepositoryContext } from "../../core/repository-context";
import { AccessDeniedError } from "../../errors";
import { projects } from "../projects/schema";
import { tasks } from "../tasks/tasks.schema";
import { and, eq } from "drizzle-orm";

export async function requireWork(
  context: RepositoryContext,
  entityId: string,
  minimum: "view" | "edit" | "owner" = "view",
) {
  const { entity, level } = await context.requireAccess(entityId, minimum);
  if (entity.entityType === "task") {
    const [task] = await context.db
      .select()
      .from(tasks)
      .where(
        and(eq(tasks.organizationId, context.scope.organizationId), eq(tasks.entityId, entityId)),
      );
    if (!task) throw new AccessDeniedError();
    return {
      entityId,
      entityType: "task" as const,
      title: task.title,
      projectEntityId: task.projectEntityId,
      status: task.status,
      statusName: taskStatusLabels[task.status],
      level,
      updatedAt: entity.updatedAt,
    };
  }
  if (entity.entityType === "project") {
    const [project] = await context.db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, context.scope.organizationId),
          eq(projects.entityId, entityId),
        ),
      );
    if (!project) throw new AccessDeniedError();
    return {
      entityId,
      entityType: "project" as const,
      title: project.name,
      projectEntityId: entityId,
      status: null,
      statusName: null,
      level,
      updatedAt: entity.updatedAt,
    };
  }
  throw new AccessDeniedError();
}
