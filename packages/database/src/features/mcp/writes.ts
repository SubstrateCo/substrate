import type { McpInput } from "@substrate/contracts/agent-tools/tools";

import type { RepositoryContext } from "../../core/repository-context";
import type { SessionIdentity } from "../../core/session/identity";
import { agentActions } from "../agent-work/actions";
import { projectRepository } from "../projects/repository";
import { taskRepository } from "../tasks/repository";
import { mcpTaskQueries } from "./tasks";

export function agentWrites(
  ctx: RepositoryContext,
  identity: SessionIdentity,
  agent: Parameters<typeof agentActions>[2],
) {
  const actions = agentActions(ctx, identity, agent);
  const queries = mcpTaskQueries(ctx, identity);
  const tasks = taskRepository(ctx);
  const projects = projectRepository(ctx);
  return {
    async createTask(input: Parameters<typeof actions.createTask>[0]) {
      return queries.getTask((await actions.createTask(input)).entityId);
    },
    async updateTask(input: Parameters<typeof actions.updateTask>[0]) {
      return queries.getTask((await actions.updateTask(input)).entityId);
    },
    async moveTask(input: Parameters<typeof actions.moveTask>[0]) {
      return queries.getTask((await actions.moveTask(input)).entityId);
    },
    async createProject(input: Parameters<typeof actions.createProject>[0]) {
      return queries.getProject({ projectId: (await actions.createProject(input)).entityId });
    },
    async updateProject(input: Parameters<typeof actions.updateProject>[0]) {
      return queries.getProject({ projectId: (await actions.updateProject(input)).entityId });
    },
    postMessage: actions.postMessage,
    async deleteTask({ taskId }: McpInput<"delete_task">) {
      const task = await tasks.get(taskId);
      await tasks.delete(taskId, task.projectEntityId);
      return { deleted: true as const, taskId };
    },
    async archiveProject({ projectId }: McpInput<"archive_project">) {
      await projects.archive(projectId);
      return queries.getProject({ projectId });
    },
    async restoreProject({ projectId }: McpInput<"restore_project">) {
      await projects.restore(projectId);
      return queries.getProject({ projectId });
    },
    async deleteProject({ projectId }: McpInput<"delete_project">) {
      await projects.delete(projectId);
      return { deleted: true as const, projectId };
    },
    async shareProject({ projectId, actorId, level }: McpInput<"share_project">) {
      await projects.share(projectId, actorId, level);
      return queries.getProject({ projectId });
    },
    async revokeProjectAccess({ projectId, actorId }: McpInput<"revoke_project_access">) {
      await projects.revoke(projectId, actorId);
      return queries.getProject({ projectId });
    },
  };
}
