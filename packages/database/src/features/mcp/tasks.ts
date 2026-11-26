import type { McpInput, McpOutput } from "@substrate/contracts/agent-tools/tools";
import type { TaskStatus } from "@substrate/contracts/tasks";
import { taskLinkRelation } from "@substrate/contracts/tasks/links";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { queryProjects } from "../projects/queries";
import { projectRepository } from "../projects/repository";
import { linksOfTask } from "../tasks/links";
import { queryTasks, queryTaskActivity, queryTaskDetail } from "../tasks/queries";
import { taskRepository } from "../tasks/repository";
import { messageFiles, taskFiles } from "./files";
import { iso, messageRef } from "./formatting";
import { linkSummary } from "./links";
import { newestFirstPagination, pagination } from "./pagination";

export function mcpTaskQueries(ctx: RepositoryContext, identity: SessionIdentity) {
  const { scope } = ctx;

  return {
    async listProjects(input: McpInput<"list_projects">) {
      const p = pagination(scope, "list_projects", input);
      const rows = await queryProjects(ctx, { offset: p.offset, limit: p.take }, input.archived);
      return p.page(
        rows.map((row) => ({ id: row.entityId, name: row.name, archived: !!row.archivedAt })),
      );
    },
    async getProject(input: McpInput<"get_project">): Promise<McpOutput<"get_project">> {
      const {
        project,
        level,
        members,
        taskCounts: rows,
      } = await projectRepository(ctx).getWithTaskCounts(input.projectId);
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
        archived: !!project.archivedAt,
        yourLevel: level,
        members: members.map((member) => ({
          actor: { id: member.actorEntityId, name: member.name, type: member.type },
          level: member.level,
        })),
        taskCounts,
        linked: await linkSummary(ctx, identity, project.entityId),
      };
    },
    // Updates move a task to the top, often the agent's own while it pages, so pages continue
    // from the last task's position instead of an offset that such moves would shift.
    async listTasks(input: McpInput<"list_tasks">) {
      const p = newestFirstPagination(scope, "list_tasks", input);
      const assignee = input.assigneeActorId === "me" ? scope.actorEntityId : input.assigneeActorId;
      const rows = await queryTasks(ctx, {
        projectEntityId: input.projectId,
        statuses: input.statuses,
        assigneeActorEntityId: assignee,
        parentTaskEntityId: input.parentTaskId,
        before: p.before,
        limit: p.take,
      });
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
        (task) => ({ id: task.id, ms: Date.parse(task.updatedAt) }),
      );
    },
    async getTask(taskId: string): Promise<McpOutput<"get_task">> {
      const task = await taskRepository(ctx).get(taskId);
      const { detail, source } = await queryTaskDetail(ctx, identity, task);
      // The source is a message the reader can open, so its files keep the message's access.
      const [attachments, sourceFiles] = await Promise.all([
        taskFiles(ctx.db, taskId),
        source ? messageFiles(ctx.db, [source.id]) : undefined,
      ]);
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
        attachments,
        sourceAttachments: (source && sourceFiles?.get(source.id)) || [],
        discussionConversationId: detail!.discussionConversationId,
        links: (await linksOfTask(ctx, taskId)).map((link) => {
          const side = link.source?.entityId === taskId ? "source" : "target";
          const other = side === "source" ? link.target : link.source;
          return {
            id: link.id,
            relation: taskLinkRelation(link.kind, side),
            task: other && {
              id: other.entityId,
              title: other.title,
              status: other.status,
              project: { id: other.projectEntityId, name: other.projectName },
            },
            blocking: link.blocking,
          };
        }),
        // Task-to-task links are already in links.
        linked: await linkSummary(ctx, identity, taskId, ["task"]),
        createdAt: iso(detail!.createdAt),
        updatedAt: iso(detail!.updatedAt),
      };
    },
    async listActivity(input: McpInput<"list_task_activity">) {
      const p = newestFirstPagination(scope, "list_task_activity", input);
      const rows = await queryTaskActivity(ctx, identity, input.taskId, {
        since: input.since ? new Date(input.since) : undefined,
        until: input.until ? new Date(input.until) : undefined,
        before: p.before,
        limit: p.take,
      });
      return p.page(
        rows.map(({ sourceMessageId, conversationId, threadId, ...event }) => ({
          ...event,
          createdAt: iso(event.createdAt),
          source:
            sourceMessageId && conversationId
              ? messageRef({ id: sourceMessageId, conversationId, threadId })
              : null,
        })),
        (event) => ({ id: event.id, ms: Date.parse(event.createdAt) }),
      );
    },
  };
}
