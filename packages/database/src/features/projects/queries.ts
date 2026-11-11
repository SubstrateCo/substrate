import type { RepositoryContext } from "../../core/repository-context";
import { liveProjectTasks } from "../tasks/access";
import { tasks } from "../tasks/tasks.schema";
import { projects } from "./schema";
import { and, asc, count } from "drizzle-orm";
import { eq } from "drizzle-orm";

export async function queryProjects(
  ctx: RepositoryContext,
  page: { offset?: number; limit?: number } = {},
) {
  await ctx.requireActiveActor();
  const query = ctx.db
    .select()
    .from(projects)
    .where(
      and(eq(projects.organizationId, ctx.scope.organizationId), ctx.readable(projects.entityId)),
    )
    .orderBy(asc(projects.name), asc(projects.entityId))
    .offset(page.offset ?? 0);
  return page.limit === undefined ? query : query.limit(page.limit);
}

// The caller has authorized the project.
export function queryProjectTaskCounts(ctx: RepositoryContext, projectEntityId: string) {
  return ctx.db
    .select({ status: tasks.status, total: count() })
    .from(tasks)
    .where(liveProjectTasks(ctx.scope, projectEntityId))
    .groupBy(tasks.status);
}
