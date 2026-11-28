import { joinActorAccount, joinedActorName } from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { liveProjectTasks } from "./access";
import { tasks } from "./tasks.schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export interface TaskExportRow {
  task: Pick<
    typeof tasks.$inferSelect,
    | "entityId"
    | "projectEntityId"
    | "parentTaskEntityId"
    | "title"
    | "description"
    | "status"
    | "priority"
    | "assigneeActorEntityId"
    | "dueDate"
  >;
  assignee: { id: string; name: string; type: "human" | "agent" } | null;
  updatedAt: Date;
}

export function firstTaskExportPage(ctx: RepositoryContext, projectEntityId: string) {
  const assignee = alias(actors, "export_assignee");
  const page = joinActorAccount(
    ctx.db
      .select({
        entityId: tasks.entityId,
        item: sql`json_build_object(
          'task', json_build_object(
            'entityId', ${tasks.entityId},
            'projectEntityId', ${tasks.projectEntityId},
            'parentTaskEntityId', ${tasks.parentTaskEntityId},
            'title', ${tasks.title},
            'description', ${tasks.description},
            'status', ${tasks.status},
            'priority', ${tasks.priority},
            'assigneeActorEntityId', ${tasks.assigneeActorEntityId},
            'dueDate', ${tasks.dueDate}),
          'assignee', case when ${assignee.entityId} is null then null else
            json_build_object('id', ${assignee.entityId},
              'name', ${joinedActorName(assignee)}, 'type', ${assignee.type}) end,
          'updatedAt', floor(extract(epoch from ${entities.updatedAt}) * 1000)
        )`.as("item"),
      })
      .from(tasks)
      .innerJoin(entities, eq(entities.entityId, tasks.entityId))
      .leftJoin(
        assignee,
        and(
          eq(assignee.entityId, tasks.assigneeActorEntityId),
          eq(assignee.organizationId, ctx.scope.organizationId),
        ),
      )
      .$dynamic(),
    assignee,
  )
    .where(liveProjectTasks(ctx.scope, projectEntityId))
    .orderBy(asc(tasks.entityId))
    .limit(100)
    .as("export_page");
  const aggregate = ctx.db
    .select({
      items: sql<(Omit<TaskExportRow, "updatedAt"> & { updatedAt: number })[]>`
        coalesce(json_agg(${page.item} order by ${page.entityId}), '[]'::json)`,
    })
    .from(page);
  // Floor retains the same millisecond as Drizzle's timestamp string parser, even before 1970.
  return sql<TaskExportRow[]>`(${aggregate})`.mapWith(
    (rows: (Omit<TaskExportRow, "updatedAt"> & { updatedAt: number })[]) =>
      rows.map((row) => ({ ...row, updatedAt: new Date(row.updatedAt) })),
  );
}
