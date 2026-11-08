import { realtimeKeys } from "@startup-os/contracts/realtime";
import type { RealtimeHint } from "@startup-os/contracts/realtime";
import type {
  projectRequest,
  taskRequest,
  tasksWorkspace,
  tasksWrite,
} from "@startup-os/contracts/tasks/input";
import { createRepositories } from "@startup-os/database";
import { ensureOwnedAgentActors, resolveHumanActor } from "@startup-os/database/provisioning";
import { projectAccessRefreshHints } from "@startup-os/database/realtime";

import { db } from "../../auth/database";
import { serviceResult } from "../../shared/service-result";
import { requireOrigin, workspaceSession } from "../../shared/workspace";
import { publishRefresh } from "../realtime/publisher";
import type { z } from "zod";

async function repositoriesForSession(headers: Headers, expectedOrganizationId: string) {
  return repositoriesForWorkspace(await workspaceSession(headers, expectedOrganizationId));
}

async function repositoriesForWorkspace({
  session,
  organizationId,
}: Awaited<ReturnType<typeof workspaceSession>>) {
  const actor = await resolveHumanActor(db, {
    organizationId,
    userId: session.user.id,
    name: session.user.name,
  });
  return createRepositories(db).forActor({ organizationId, actorEntityId: actor.entityId });
}

export function listProjects(headers: Headers, input: z.output<typeof tasksWorkspace>) {
  return serviceResult(async () => {
    const repositories = await repositoriesForSession(headers, input.organizationId);
    return repositories.projects.list();
  });
}

export function getProject(headers: Headers, input: z.output<typeof projectRequest>) {
  return serviceResult(async () => {
    const workspace = await workspaceSession(headers, input.organizationId);
    await ensureOwnedAgentActors(db, {
      organizationId: workspace.organizationId,
      userId: workspace.session.user.id,
    });
    const repositories = await repositoriesForWorkspace(workspace);
    return repositories.projects.getDetail(input.projectEntityId);
  });
}

export function listTaskComments(headers: Headers, input: z.output<typeof taskRequest>) {
  return serviceResult(async () => {
    const repositories = await repositoriesForSession(headers, input.organizationId);
    return repositories.tasks.listComments(input.taskEntityId, input.projectEntityId);
  });
}

export function mutateTasks(headers: Headers, input: z.output<typeof tasksWrite>) {
  return serviceResult(async () => {
    requireOrigin(headers);
    const repositories = await repositoriesForSession(headers, input.organizationId);
    const result = await repositories.transaction(async (repos) => {
      switch (input.action) {
        case "createProject":
          return { id: (await repos.projects.create(input)).entityId };
        case "updateProject":
          await repos.projects.update(input.projectEntityId, input);
          break;
        case "createTask":
          return { id: (await repos.tasks.create(input)).entityId };
        case "updateTask":
          await repos.tasks.update(input.taskEntityId, input, input.projectEntityId);
          return { id: input.taskEntityId };
        case "comment":
          await repos.tasks.addComment(input.taskEntityId, input.body, input.projectEntityId);
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
          await repos.projects.get(input.projectEntityId);
          await repos.permissions.revoke({
            entityId: input.projectEntityId,
            actorEntityId: input.actorEntityId,
          });
          break;
      }
      return { id: input.projectEntityId };
    });
    const hints: RealtimeHint[] =
      input.action === "share" || input.action === "revoke"
        ? await projectAccessRefreshHints(db, input.organizationId, input.actorEntityId)
        : [{ audience: realtimeKeys.organization(input.organizationId), domain: "tasks" }];
    if (
      (input.action === "createTask" || input.action === "updateTask") &&
      input.assigneeActorEntityId
    )
      hints.push({
        audience: realtimeKeys.actor(input.organizationId, input.assigneeActorEntityId),
        domain: "notifications",
      });
    await publishRefresh(hints);
    return result;
  });
}
