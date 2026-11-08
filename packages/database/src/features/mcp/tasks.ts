import type { McpInput, McpOutput } from "@startup-os/contracts/harness/tools";

import { actors } from "../../core/actors/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { taskActivity } from "../activity/schema";
import { visibleConversations, type MessagingIdentity } from "../messaging/access";
import { messagingMessages, messagingConversations } from "../messaging/schema";
import { projectRepository } from "../projects/repository";
import { projects } from "../projects/schema";
import { taskComments } from "../tasks/comments.schema";
import { taskRepository } from "../tasks/repository";
import { tasks } from "../tasks/tasks.schema";
import { pagination } from "./pagination";
import { and, asc, desc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";

export const actorSelection = { id: actors.entityId, name: actors.name, type: actors.type };

function taskResult(
  row: typeof tasks.$inferSelect,
  assignee: { id: string; name: string; type: "human" | "agent" } | null,
) {
  return {
    id: row.entityId,
    projectId: row.projectEntityId,
    parentTaskId: row.parentTaskEntityId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assignee,
    dueDate: row.dueDate,
  };
}

export function mcpTaskQueries(ctx: RepositoryContext, identity: MessagingIdentity) {
  const { db, scope } = ctx;
  return {
    async listProjects(input: McpInput<"list_projects">) {
      const p = pagination(scope, "list_projects", input);
      const rows = await db
        .select({ id: projects.entityId, name: projects.name })
        .from(projects)
        .where(
          and(
            eq(projects.organizationId, scope.organizationId),
            inArray(projects.entityId, ctx.readableEntities()),
          ),
        )
        .orderBy(asc(projects.name), asc(projects.entityId))
        .offset(p.offset)
        .limit(p.take);
      return p.page(rows);
    },
    async getProject(input: McpInput<"get_project">) {
      const project = await projectRepository(ctx).get(input.projectId);
      const p = pagination(scope, "get_project", input);
      let parentFilter;
      if (input.parentTaskId === null) parentFilter = isNull(tasks.parentTaskEntityId);
      else if (input.parentTaskId) parentFilter = eq(tasks.parentTaskEntityId, input.parentTaskId);
      const rows = await db
        .select({ task: tasks, assignee: actorSelection })
        .from(tasks)
        .leftJoin(
          actors,
          and(
            eq(actors.entityId, tasks.assigneeActorEntityId),
            eq(actors.organizationId, scope.organizationId),
          ),
        )
        .where(
          and(
            eq(tasks.organizationId, scope.organizationId),
            eq(tasks.projectEntityId, input.projectId),
            inArray(tasks.entityId, ctx.readableEntities()),
            input.statuses ? inArray(tasks.status, input.statuses) : undefined,
            input.assigneeActorId
              ? eq(tasks.assigneeActorEntityId, input.assigneeActorId)
              : undefined,
            parentFilter,
          ),
        )
        .orderBy(asc(tasks.entityId))
        .offset(p.offset)
        .limit(p.take);
      return {
        id: project.entityId,
        name: project.name,
        description: project.description,
        tasks: p.page(
          rows.map(({ task, assignee }) => {
            const { projectId: _, description: __, ...summary } = taskResult(task, assignee);
            return summary;
          }),
        ),
      };
    },
    async getTask(taskId: string) {
      const task = await taskRepository(ctx).get(taskId);
      const [assignee] = task.assigneeActorEntityId
        ? await db
            .select(actorSelection)
            .from(actors)
            .where(
              and(
                eq(actors.entityId, task.assigneeActorEntityId),
                eq(actors.organizationId, scope.organizationId),
              ),
            )
        : [];
      return taskResult(task, assignee ?? null);
    },
    async listComments(input: McpInput<"list_task_comments">) {
      await taskRepository(ctx).get(input.taskId);
      const p = pagination(scope, "list_task_comments", input);
      const rows = await db
        .select({
          id: taskComments.id,
          body: taskComments.body,
          author: actorSelection,
          createdAt: taskComments.createdAt,
        })
        .from(taskComments)
        .innerJoin(actors, eq(actors.entityId, taskComments.authorActorEntityId))
        .where(
          and(
            eq(taskComments.organizationId, scope.organizationId),
            eq(taskComments.taskEntityId, input.taskId),
            input.since ? gte(taskComments.createdAt, new Date(input.since)) : undefined,
            input.until ? lt(taskComments.createdAt, new Date(input.until)) : undefined,
          ),
        )
        .orderBy(desc(taskComments.createdAt), desc(taskComments.id))
        .offset(p.offset)
        .limit(p.take);
      return p.page(rows);
    },
    async listActivity(input: McpInput<"list_activity">) {
      await taskRepository(ctx).get(input.taskId);
      const p = pagination(scope, "list_activity", input);
      const rows = await db
        .select({
          id: taskActivity.id,
          actor: actorSelection,
          action: taskActivity.action,
          createdAt: taskActivity.createdAt,
          sourceMessageId: messagingMessages.id,
          conversationId: messagingConversations.id,
        })
        .from(taskActivity)
        .innerJoin(actors, eq(actors.entityId, taskActivity.actorEntityId))
        .leftJoin(messagingMessages, eq(messagingMessages.id, taskActivity.sourceMessageId))
        .leftJoin(
          messagingConversations,
          eq(messagingConversations.id, messagingMessages.conversationId),
        )
        .where(
          and(
            eq(taskActivity.organizationId, scope.organizationId),
            eq(taskActivity.taskEntityId, input.taskId),
            or(isNull(taskActivity.sourceMessageId), visibleConversations(db, identity)),
            input.since ? gte(taskActivity.createdAt, new Date(input.since)) : undefined,
            input.until ? lt(taskActivity.createdAt, new Date(input.until)) : undefined,
          ),
        )
        .orderBy(desc(taskActivity.createdAt), desc(taskActivity.id))
        .offset(p.offset)
        .limit(p.take);
      return p.page(
        rows.map(({ sourceMessageId, conversationId, ...event }) => {
          const item: McpOutput<"list_activity">["items"][number] = {
            ...event,
            createdAt: event.createdAt.toISOString(),
          };
          if (sourceMessageId && conversationId)
            item.source = { type: "message", messageId: sourceMessageId, conversationId };
          return item;
        }),
      );
    },
  };
}
