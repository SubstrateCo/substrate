import type { RepositoryContext } from "../../core/repository-context";
import { projects } from "../projects/schema";
import { tasks } from "./tasks.schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

export function homeTasks(ctx: RepositoryContext) {
  return ctx.db
    .select({
      entityId: tasks.entityId,
      projectEntityId: tasks.projectEntityId,
      projectName: projects.name,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.entityId, tasks.projectEntityId))
    .where(
      and(
        eq(tasks.organizationId, ctx.scope.organizationId),
        eq(tasks.assigneeActorEntityId, ctx.scope.actorEntityId),
        inArray(tasks.status, ["not_started", "in_progress", "in_review"]),
        ctx.readable(tasks.entityId),
        ctx.readable(projects.entityId),
      ),
    )
    .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.entityId))
    .limit(6);
}
