import type {
  projectRequest,
  taskRequest,
  taskLocationRequest,
  tasksWorkspace,
  tasksWrite,
} from "@substrate/contracts/tasks/input";

import type { createCommittedPublisher } from "../../shared/committed";
import type { WorkspaceScope } from "../../shared/scope-types";
import { serviceResult } from "../../shared/service-result";
import { exportProject } from "./export";
import type { z } from "zod";

export function createTasksService(deps: {
  publish: ReturnType<typeof createCommittedPublisher>;
  ensureOwnedAgentActors(identity: { organizationId: string; userId: string }): Promise<void>;
}) {
  const publishCommitted = deps.publish;
  function listProjects(scope: WorkspaceScope, _input: z.output<typeof tasksWorkspace>) {
    return serviceResult(async () => {
      const { repositories } = scope;
      return repositories.projects.list();
    });
  }

  function getProject(scope: WorkspaceScope, input: z.output<typeof projectRequest>) {
    return serviceResult(async () => {
      await deps.ensureOwnedAgentActors({
        organizationId: scope.organizationId,
        userId: scope.userId,
      });
      const { repositories } = scope;
      return repositories.projects.getDetail(input.projectEntityId);
    });
  }

  function ensureDiscussion(scope: WorkspaceScope, input: z.output<typeof taskRequest>) {
    return serviceResult(async () => {
      const { repositories } = scope;
      return {
        conversationId: await publishCommitted(
          await repositories.tasks.ensureDiscussion(input.taskEntityId, input.projectEntityId),
        ),
      };
    });
  }

  function getTaskLocation(scope: WorkspaceScope, input: z.output<typeof taskLocationRequest>) {
    return serviceResult(async () => {
      const { repositories } = scope;
      const task = await repositories.tasks.get(input.taskEntityId);
      return { projectEntityId: task.projectEntityId };
    });
  }

  function mutateTasks(scope: WorkspaceScope, input: z.output<typeof tasksWrite>) {
    return serviceResult(async () => {
      const { repositories } = scope;
      const result = await repositories.transaction(async (repos) => {
        switch (input.action) {
          case "createProject":
            return { id: (await repos.projects.create(input)).entityId };
          case "updateProject":
            await repos.projects.update(input.projectEntityId, input);
            break;
          case "setProjectPicture":
            await repos.projects.setPicture(input.projectEntityId, input.image);
            break;
          case "createTask":
            return { id: (await repos.tasks.create(input)).entityId };
          case "updateTask":
            await repos.tasks.update(input.taskEntityId, input, input.projectEntityId);
            return { id: input.taskEntityId };
          case "deleteProject":
            await repos.projects.delete(input.projectEntityId);
            break;
          case "deleteTask":
            await repos.tasks.delete(input.taskEntityId, input.projectEntityId);
            return { id: input.taskEntityId };
          case "moveTask":
            await repos.tasks.move(
              input.taskEntityId,
              input.projectEntityId,
              input.destinationProjectEntityId,
              input.parentTaskEntityId,
            );
            return { id: input.taskEntityId };
          case "addTaskLink":
            await repos.tasks.addLink(
              input.taskEntityId,
              input.relation,
              input.otherTaskEntityId,
              input.projectEntityId,
            );
            return { id: input.taskEntityId };
          case "removeTaskLink":
            await repos.tasks.removeLink(input.taskEntityId, input.linkId, input.projectEntityId);
            return { id: input.taskEntityId };
          case "share":
            // Grants through this API apply only to projects.
            await repos.projects.get(input.projectEntityId);
            await repos.permissions.grant({
              entityId: input.projectEntityId,
              actorEntityId: input.actorEntityId,
              level: input.level,
            });
            break;
          case "revoke":
            await repos.projects.revoke(input.projectEntityId, input.actorEntityId);
            break;
        }
        return { id: input.projectEntityId };
      });
      return publishCommitted(result);
    });
  }
  return {
    home: (scope: WorkspaceScope) => serviceResult(() => scope.repositories.tasks.home()),
    export: exportProject,
    listProjects,
    getProject,
    ensureDiscussion,
    getTaskLocation,
    mutateTasks,
  };
}
export type TasksService = ReturnType<typeof createTasksService>;
