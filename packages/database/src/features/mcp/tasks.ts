import type { McpInput, McpOutput } from "@startup-os/contracts/harness/tools";
import type { TaskStatus } from "@startup-os/contracts/tasks";

import { actorAuthorKind, actorDisplayName } from "../../core/actors/display-name";
import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import type { RepositoryContext } from "../../core/repository-context";
import { taskActivity } from "../activity/schema";
import { messageEntityReferences } from "../context/schema";
import {
  visibleConversationIds,
  visibleConversations,
  type MessagingIdentity,
} from "../messaging/access";
import { messagingMessages, messagingConversations } from "../messaging/schema";
import { projectRepository } from "../projects/repository";
import { projects } from "../projects/schema";
import { liveTask } from "../tasks/access";
import { taskComments } from "../tasks/comments.schema";
import { taskRepository } from "../tasks/repository";
import { tasks } from "../tasks/tasks.schema";
import { iso, messageRef } from "./formatting";
import { pagination } from "./pagination";
import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export const actorSelection = { id: actors.entityId, name: actorDisplayName(), type: actors.type };
/** An actor that wrote quoted text, labeled owner, member or agent for the reading agent. */
export function authorSelection(ownerUserId: string) {
  return { ...actorSelection, kind: actorAuthorKind(ownerUserId) };
}

export function mcpTaskQueries(ctx: RepositoryContext, identity: MessagingIdentity) {
  const { db, scope } = ctx;
  const inOrganization = eq(tasks.organizationId, scope.organizationId);
  // Every caller has checked the task's project first.
  const readableTask = liveTask();
  const assigneeJoin = and(
    eq(actors.entityId, tasks.assigneeActorEntityId),
    eq(actors.organizationId, scope.organizationId),
  );
  const visibleIds = visibleConversationIds(db, identity);

  return {
    async listProjects(input: McpInput<"list_projects">) {
      const p = pagination(scope, "list_projects", input);
      const rows = await db
        .select({ id: projects.entityId, name: projects.name })
        .from(projects)
        .where(
          and(eq(projects.organizationId, scope.organizationId), ctx.readable(projects.entityId)),
        )
        .orderBy(asc(projects.name), asc(projects.entityId))
        .offset(p.offset)
        .limit(p.take);
      return p.page(rows);
    },
    async getProject(input: McpInput<"get_project">): Promise<McpOutput<"get_project">> {
      const project = await projectRepository(ctx).get(input.projectId);
      const rows = await db
        .select({ status: tasks.status, total: count() })
        .from(tasks)
        .where(and(inOrganization, eq(tasks.projectEntityId, input.projectId), readableTask))
        .groupBy(tasks.status);
      const taskCounts: Record<TaskStatus, number> = {
        not_started: 0,
        in_progress: 0,
        in_review: 0,
        completed: 0,
        canceled: 0,
      };
      for (const row of rows) taskCounts[row.status] = row.total;
      return {
        id: project.entityId,
        name: project.name,
        description: project.description,
        taskCounts,
      };
    },
    async listTasks(input: McpInput<"list_tasks">) {
      await projectRepository(ctx).get(input.projectId);
      const p = pagination(scope, "list_tasks", input);
      const assignee = input.assigneeActorId === "me" ? scope.actorEntityId : input.assigneeActorId;
      let parentFilter;
      if (input.parentTaskId === null) parentFilter = isNull(tasks.parentTaskEntityId);
      else if (input.parentTaskId) parentFilter = eq(tasks.parentTaskEntityId, input.parentTaskId);
      const rows = await db
        .select({ task: tasks, assignee: actorSelection, updatedAt: entities.updatedAt })
        .from(tasks)
        .innerJoin(entities, eq(entities.entityId, tasks.entityId))
        .leftJoin(actors, assigneeJoin)
        .where(
          and(
            inOrganization,
            eq(tasks.projectEntityId, input.projectId),
            readableTask,
            input.statuses ? inArray(tasks.status, input.statuses) : undefined,
            assignee ? eq(tasks.assigneeActorEntityId, assignee) : undefined,
            parentFilter,
          ),
        )
        .orderBy(desc(entities.updatedAt), desc(tasks.entityId))
        .offset(p.offset)
        .limit(p.take);
      return p.page(
        rows.map(({ task, assignee, updatedAt }) => ({
          id: task.entityId,
          title: task.title,
          status: task.status,
          priority: task.priority,
          assignee,
          dueDate: task.dueDate,
          parentTaskId: task.parentTaskEntityId,
          updatedAt: iso(updatedAt),
        })),
      );
    },
    async getTask(taskId: string): Promise<McpOutput<"get_task">> {
      const task = await taskRepository(ctx).get(taskId);
      const parent = alias(tasks, "parent");
      const subtask = alias(tasks, "subtask");
      const subtaskCount = db
        .select({ total: sql`count(*)` })
        .from(subtask)
        .where(
          and(
            eq(subtask.organizationId, scope.organizationId),
            // Subtasks share their parent's project, which bounds the scan by the unique index.
            eq(subtask.projectEntityId, tasks.projectEntityId),
            eq(subtask.parentTaskEntityId, tasks.entityId),
            liveTask(subtask.entityId),
          ),
        );
      const commentCount = db
        .select({ total: sql`count(*)` })
        .from(taskComments)
        .where(
          and(
            eq(taskComments.organizationId, scope.organizationId),
            eq(taskComments.taskEntityId, tasks.entityId),
          ),
        );
      const [detail] = await db
        .select({
          assignee: actorSelection,
          projectName: projects.name,
          createdAt: entities.createdAt,
          updatedAt: entities.updatedAt,
          parent: { id: parent.entityId, title: parent.title },
          subtaskCount: sql<number>`(${subtaskCount})`.mapWith(Number),
          commentCount: sql<number>`(${commentCount})`.mapWith(Number),
        })
        .from(tasks)
        .innerJoin(entities, eq(entities.entityId, tasks.entityId))
        .innerJoin(projects, eq(projects.entityId, tasks.projectEntityId))
        .leftJoin(actors, assigneeJoin)
        .leftJoin(
          parent,
          and(
            eq(parent.organizationId, scope.organizationId),
            eq(parent.entityId, tasks.parentTaskEntityId),
            liveTask(parent.entityId),
          ),
        )
        .where(and(inOrganization, eq(tasks.entityId, taskId)));
      // Only messages in conversations the caller can see are counted or shown.
      const references = and(
        eq(messageEntityReferences.organizationId, scope.organizationId),
        eq(messageEntityReferences.entityId, taskId),
        inArray(messageEntityReferences.conversationId, visibleIds),
      );
      const [linked] = await db
        .select({ total: countDistinct(messageEntityReferences.messageId) })
        .from(messageEntityReferences)
        .where(references);
      const [source] = await db
        .select({
          id: messagingMessages.id,
          conversationId: messagingMessages.conversationId,
          threadId: messagingMessages.threadId,
        })
        .from(messageEntityReferences)
        .innerJoin(messagingMessages, eq(messagingMessages.id, messageEntityReferences.messageId))
        .where(and(references, eq(messageEntityReferences.purpose, "source")))
        .orderBy(asc(messageEntityReferences.createdAt))
        .limit(1);
      return {
        id: task.entityId,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignee: detail!.assignee,
        dueDate: task.dueDate,
        project: { id: task.projectEntityId, name: detail!.projectName },
        parent: detail!.parent,
        subtaskCount: detail!.subtaskCount,
        source: source ? messageRef(source) : null,
        commentCount: detail!.commentCount,
        linkedMessageCount: linked!.total,
        createdAt: iso(detail!.createdAt),
        updatedAt: iso(detail!.updatedAt),
      };
    },
    async listComments(input: McpInput<"list_task_comments">) {
      await taskRepository(ctx).get(input.taskId);
      const p = pagination(scope, "list_task_comments", input);
      const rows = await db
        .select({
          id: taskComments.id,
          body: taskComments.body,
          author: authorSelection(identity.userId),
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
      return p.page(rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) })));
    },
    async listActivity(input: McpInput<"list_task_activity">) {
      await taskRepository(ctx).get(input.taskId);
      const p = pagination(scope, "list_task_activity", input);
      const rows = await db
        .select({
          id: taskActivity.id,
          actor: actorSelection,
          action: taskActivity.action,
          createdAt: taskActivity.createdAt,
          sourceMessageId: messagingMessages.id,
          conversationId: messagingConversations.id,
          threadId: messagingMessages.threadId,
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
        rows.map(({ sourceMessageId, conversationId, threadId, ...event }) => ({
          ...event,
          createdAt: iso(event.createdAt),
          source:
            sourceMessageId && conversationId
              ? messageRef({ id: sourceMessageId, conversationId, threadId })
              : null,
        })),
      );
    },
  };
}
