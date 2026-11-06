import {
  projectRequest,
  taskRequest,
  tasksWorkspace,
  tasksWrite,
  type TasksWrite,
} from "@startup-os/contracts/tasks/input";
import { AccessDeniedError, createRepositories } from "@startup-os/database";
import { ensureHumanActor } from "@startup-os/database/provisioning";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";

async function repositoriesForSession(headers: Headers, expectedOrganizationId: string) {
  const { session, organizationId } = await workspaceSession(headers, expectedOrganizationId);
  const actor = await ensureHumanActor(db, {
    organizationId,
    userId: session.user.id,
    name: session.user.name,
  });
  return createRepositories(db).forActor({ organizationId, actorEntityId: actor.entityId });
}

export function listProjects(headers: Headers, raw: { organizationId: string }) {
  return serviceResult(async () => {
    const input = tasksWorkspace.parse(raw);
    const repositories = await repositoriesForSession(headers, input.organizationId);
    return repositories.projects.list();
  });
}

export function getProject(
  headers: Headers,
  raw: { organizationId: string; projectEntityId: string },
) {
  return serviceResult(async () => {
    const input = projectRequest.parse(raw);
    const repositories = await repositoriesForSession(headers, input.organizationId);
    return repositories.transaction(async (repos) => ({
      project: await repos.projects.get(input.projectEntityId),
      level: await repos.permissions.getEffectiveLevel(input.projectEntityId),
      members: await repos.projects.listMembers(input.projectEntityId),
      actors: await repos.projects.availableActors(input.projectEntityId),
      tasks: await repos.tasks.list(input.projectEntityId),
    }));
  });
}

export function listTaskComments(
  headers: Headers,
  raw: { organizationId: string; projectEntityId: string; taskEntityId: string },
) {
  return serviceResult(async () => {
    const input = taskRequest.parse(raw);
    const repositories = await repositoriesForSession(headers, input.organizationId);
    const task = await repositories.tasks.get(input.taskEntityId);
    if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
    return repositories.tasks.listComments(task.entityId);
  });
}

export function mutateTasks(headers: Headers, raw: TasksWrite) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const input = tasksWrite.parse(raw);
    const repositories = await repositoriesForSession(headers, input.organizationId);
    return repositories.transaction(async (repos) => {
      if (input.action === "createProject")
        return { id: (await repos.projects.create(input)).entityId };
      await repos.projects.get(input.projectEntityId);
      switch (input.action) {
        case "updateProject":
          await repos.projects.update(input.projectEntityId, input);
          break;
        case "createTask":
          return { id: (await repos.tasks.create(input)).entityId };
        case "updateTask":
        case "comment": {
          const task = await repos.tasks.get(input.taskEntityId);
          if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
          if (input.action === "updateTask") await repos.tasks.update(input.taskEntityId, input);
          else await repos.tasks.addComment(input.taskEntityId, input.body);
          return { id: task.entityId };
        }
        case "share":
          await repos.permissions.grant({
            entityId: input.projectEntityId,
            actorEntityId: input.actorEntityId,
            level: input.level,
          });
          break;
        case "revoke":
          await repos.permissions.revoke({
            entityId: input.projectEntityId,
            actorEntityId: input.actorEntityId,
          });
          break;
      }
      return { id: input.projectEntityId };
    });
  });
}
