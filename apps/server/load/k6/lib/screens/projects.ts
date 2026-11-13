import { cached, invalidate } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys, type HintTarget, type QueryKey } from "../keys.ts";
import type { World } from "../world.ts";
import type { Level, ProjectDetail } from "./tasks.ts";
import { boards } from "./tasks.ts";

/**
 * Project writes from the project form and the sharing dialog (components/tasks/projects/...),
 * with the invalidation of invalidateTasksWrite in apps/web/src/queries/tasks/mutations.ts.
 * Task writes are in task-writes.ts.
 */

type ProjectWrite =
  | { action: "createProject"; name: string; description?: string }
  | { action: "updateProject"; projectEntityId: string; name: string; description: string }
  | { action: "share"; projectEntityId: string; actorEntityId: string; level: Level }
  | { action: "revoke"; projectEntityId: string; actorEntityId: string };

function targets(org: string, input: ProjectWrite, id: string): (QueryKey | HintTarget)[] {
  const projectId = "projectEntityId" in input ? input.projectEntityId : id;
  const access = input.action === "share" || input.action === "revoke";
  const detail = cached<ProjectDetail>(keys.project(org, projectId));
  const entityIds = access
    ? [projectId, ...(detail?.tasks.map((task) => task.entityId) ?? [])]
    : [id];
  const list: (QueryKey | HintTarget)[] = [
    keys.project(org, projectId),
    ...[keys.search(org), keys.searchPages(org)].map((prefix) => ({
      prefix,
      staleOnly: true as const,
    })),
    keys.projects(org),
  ];
  if (input.action !== "createProject") {
    list.push({ prefix: keys.messagePages(org), withLinks: true }, keys.notifications(org));
  }
  if (access) {
    for (const entityId of entityIds)
      list.push(keys.related(org, entityId), keys.activity(org, entityId));
  }
  return list;
}

/**
 * Deletes a project from its editor (project-delete.tsx). Like the web, the delete resets every
 * task, context and search query; the pane is already closed, so its board is not read again.
 */
export async function deleteProject(world: World, projectEntityId: string) {
  const org = world.organizationId;
  const result = await call("tasks.mutations", { action: "deleteProject", projectEntityId });
  if (!result) return false;
  boards.delete(projectEntityId);
  world.projects = world.projects.filter((row) => row.entityId !== projectEntityId);
  world.tasks = world.tasks.filter((row) => row.projectEntityId !== projectEntityId);
  await invalidate(
    [
      keys.tasks(org),
      keys.related(org),
      keys.activity(org),
      keys.messagePages(org),
      keys.messageTargets(org),
      keys.notifications(org),
      keys.search(org),
      keys.searchPages(org),
    ],
    "mutation",
  );
  return true;
}

/** Saves an uploaded project icon (api/tasks/requests.ts uploadProjectPicture). */
export async function setProjectPicture(world: World, projectEntityId: string, image: string) {
  const org = world.organizationId;
  const result = await call("tasks.mutations", {
    action: "setProjectPicture",
    projectEntityId,
    image,
  });
  if (result)
    await invalidate([keys.project(org, projectEntityId), keys.projects(org)], "mutation");
  return !!result;
}

/** Sends one project write. Resolves the project ID, or null. */
export async function writeProject(world: World, input: ProjectWrite) {
  const result = await call<{ id: string }>("tasks.mutations", input);
  if (!result) return null;
  await invalidate(targets(world.organizationId, input, result.id), "mutation");
  return result.id;
}
