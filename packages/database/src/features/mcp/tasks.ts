import type { McpInput, McpOutput } from "@substrate/contracts/harness/tools";
import type { TaskStatus } from "@substrate/contracts/tasks";
import { taskLinkRelation } from "@substrate/contracts/tasks/links";

import { actorAuthorKind } from "../../core/actors/display-name";
import { joinedActorName } from "../../core/actors/joined-profile";
import { actors } from "../../core/actors/schema";
import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { queryProjects, queryProjectTaskCounts } from "../projects/queries";
import { projectRepository } from "../projects/repository";
import { linksOfTask } from "../tasks/links";
import { queryTasks, queryTaskActivity, queryTaskDetail } from "../tasks/queries";
import { taskRepository } from "../tasks/repository";
import { iso, messageRef } from "./formatting";
import { pagination } from "./pagination";

export const actorSelection = {
  id: actors.entityId,
  name: joinedActorName(),
  type: actors.type,
};
/** An actor that wrote quoted text, labeled owner, member or agent for the reading agent. */
export function authorSelection(ownerUserId: string) {
  return { ...actorSelection, kind: actorAuthorKind(ownerUserId) };
}

export function mcpTaskQueries(ctx: RepositoryContext, identity: SessionIdentity) {
  const { scope } = ctx;

  return {
    async listProjects(input: McpInput<"list_projects">) {
      const p = pagination(scope, "list_projects", input);
      const rows = await queryProjects(ctx, { offset: p.offset, limit: p.take });
      return p.page(rows.map((row) => ({ id: row.entityId, name: row.name })));
    },
    async getProject(input: McpInput<"get_project">): Promise<McpOutput<"get_project">> {
      const project = await projectRepository(ctx).get(input.projectId);
      const rows = await queryProjectTaskCounts(ctx, input.projectId);
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
      const p = pagination(scope, "list_tasks", input);
      const assignee = input.assigneeActorId === "me" ? scope.actorEntityId : input.assigneeActorId;
      const rows = await queryTasks(ctx, {
        projectEntityId: input.projectId,
        statuses: input.statuses,
        assigneeActorEntityId: assignee,
        parentTaskEntityId: input.parentTaskId,
        offset: p.offset,
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
      );
    },
    async getTask(taskId: string): Promise<McpOutput<"get_task">> {
      const task = await taskRepository(ctx).get(taskId);
      const { detail, linkedMessageCount, source } = await queryTaskDetail(ctx, identity, task);
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
        discussionConversationId: detail!.discussionConversationId,
        linkedMessageCount,
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
        createdAt: iso(detail!.createdAt),
        updatedAt: iso(detail!.updatedAt),
      };
    },
    async listActivity(input: McpInput<"list_task_activity">) {
      const p = pagination(scope, "list_task_activity", input);
      const rows = await queryTaskActivity(ctx, identity, input.taskId, {
        since: input.since ? new Date(input.since) : undefined,
        until: input.until ? new Date(input.until) : undefined,
        offset: p.offset,
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
      );
    },
  };
}
