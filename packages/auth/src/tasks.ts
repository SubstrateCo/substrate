import { AccessDeniedError, createRepositories } from "@startup-os/database";
import { ensureHumanActor } from "@startup-os/database/provisioning";
import { db } from "./database";
import { authEnvironment } from "./environment";
import { auth } from "./server";
import {
  projectRequest,
  taskRequest,
  tasksWorkspace,
  tasksWrite,
  type TasksWrite,
} from "./tasks-contract";
import { requireTasksOrigin, requireTasksWorkspace } from "./tasks-policy";

const { baseURL } = authEnvironment();

async function repositoriesForSession(headers: Headers, expectedOrganizationId: string) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error("Sign in to continue.");
  if (!session.user.emailVerified) throw new Error("Verify your email to continue.");
  const organizationId = requireTasksWorkspace(
    expectedOrganizationId,
    session.session.activeOrganizationId,
  );
  await auth.api.getActiveMemberRole({ headers, query: { organizationId } });
  const actor = await ensureHumanActor(db, {
    organizationId,
    userId: session.user.id,
    name: session.user.name,
  });
  return createRepositories(db).forActor({ organizationId, actorEntityId: actor.entityId });
}

async function execute<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Error && error.name === "AccessDeniedError")
      throw new Error("Project or task not found or access denied.");
    if (error instanceof Error && ["ValidationError", "ConflictError"].includes(error.name))
      throw new Error(error.message);
    console.error("Tasks operation failed", error instanceof Error ? error.name : "Unknown error");
    throw new Error("Tasks are unavailable. Please try again.");
  }
}

export async function readProjects(headers: Headers, raw: { organizationId: string }) {
  const input = tasksWorkspace.parse(raw);
  const repositories = await repositoriesForSession(headers, input.organizationId);
  return execute(() => repositories.projects.list());
}

export async function readProject(
  headers: Headers,
  raw: { organizationId: string; projectEntityId: string },
) {
  const input = projectRequest.parse(raw);
  const repositories = await repositoriesForSession(headers, input.organizationId);
  return execute(() =>
    repositories.transaction(async (repos) => ({
      project: await repos.projects.get(input.projectEntityId),
      level: await repos.permissions.getEffectiveLevel(input.projectEntityId),
      statuses: await repos.projects.listStatuses(input.projectEntityId),
      members: await repos.projects.listMembers(input.projectEntityId),
      actors: await repos.projects.availableActors(input.projectEntityId),
      tasks: await repos.tasks.list(input.projectEntityId),
    })),
  );
}

export async function readTaskComments(
  headers: Headers,
  raw: { organizationId: string; projectEntityId: string; taskEntityId: string },
) {
  const input = taskRequest.parse(raw);
  const repositories = await repositoriesForSession(headers, input.organizationId);
  return execute(async () => {
    const task = await repositories.tasks.get(input.taskEntityId);
    if (task.projectEntityId !== input.projectEntityId) throw new AccessDeniedError();
    return repositories.tasks.listComments(task.entityId);
  });
}

export async function writeTasks(headers: Headers, raw: TasksWrite): Promise<{ id: string }> {
  requireTasksOrigin(headers.get("origin"), baseURL);
  const input = tasksWrite.parse(raw);
  const repositories = await repositoriesForSession(headers, input.organizationId);
  return execute(() =>
    repositories.transaction(async (repos) => {
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
        case "addStatus":
          await repos.projects.addStatus(input.projectEntityId, input);
          break;
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
    }),
  );
}
