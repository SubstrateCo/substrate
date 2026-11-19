import type { TaskPriority, TaskStatus } from "@substrate/contracts/tasks";

import { cached, invalidate, mount, unmount } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys, type HintTarget, type QueryKey } from "../keys.ts";
import type { World } from "../world.ts";
import {
  boards,
  applyBoard,
  openProjectId,
  openTask,
  openTaskId,
  settleTask,
  type ProjectDetail,
  type Task,
} from "./tasks.ts";

/** The task fields a form or an inline control can send. */
export interface TaskFields {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeActorEntityId?: string | null;
  dueDate?: string | null;
}

export type TaskTarget = Pick<Task, "projectEntityId"> & { taskEntityId: string };

export type TasksWrite =
  | ({
      action: "createTask";
      projectEntityId: string;
      title: string;
      parentTaskEntityId?: string;
      attachmentFileIds?: string[];
    } & TaskFields)
  | ({ action: "updateTask" } & TaskTarget & TaskFields)
  | ({ action: "addTaskLink"; relation: string; otherTaskEntityId: string } & TaskTarget)
  | ({ action: "removeTaskLink"; linkId: string } & TaskTarget)
  | ({ action: "deleteTask" } & TaskTarget)
  | ({
      action: "moveTask";
      destinationProjectEntityId: string;
      parentTaskEntityId: string | null;
    } & TaskTarget);

/** Mirrors invalidateTasksWrite in apps/web/src/queries/tasks/mutations.ts for these actions. */
function writeTargets(org: string, input: TasksWrite, id: string): (QueryKey | HintTarget)[] {
  const searches = [keys.search(org), keys.searchPages(org)];
  if (input.action === "deleteTask" || input.action === "moveTask")
    // The web resets these; a reset refetches what is mounted, like an invalidation.
    return [
      keys.tasks(org),
      keys.related(org),
      keys.activity(org),
      keys.messagePages(org),
      keys.messageTargets(org),
      keys.notifications(org),
      ...searches,
    ];
  if (input.action === "addTaskLink" || input.action === "removeTaskLink")
    return [keys.projectDetails(org), keys.activity(org), keys.related(org)];
  return [
    keys.project(org, input.projectEntityId),
    ...searches.map((prefix) => ({ prefix, staleOnly: true as const })),
    keys.activity(org, id),
    // invalidateWorkLabels: message pages that show a link to this task.
    ...(input.action === "updateTask"
      ? [{ prefix: keys.messagePages(org), withLinks: true as const }]
      : []),
    keys.notifications(org),
  ];
}

/** Applies a write to the boards this client holds, as the web's optimistic patch and refetch do. */
function patchBoard(input: TasksWrite, id: string) {
  const detail = boards.get(input.projectEntityId);
  if (!detail) return;
  if (input.action === "createTask") {
    const { action: _action, parentTaskEntityId, attachmentFileIds: _files, ...fields } = input;
    detail.tasks.push({
      entityId: id,
      parentTaskEntityId: parentTaskEntityId ?? null,
      description: "",
      status: "not_started",
      priority: "none",
      assigneeActorEntityId: null,
      dueDate: null,
      ...fields,
    });
  } else if (input.action === "updateTask") {
    const task = detail.tasks.find((row) => row.entityId === input.taskEntityId);
    const { action: _action, projectEntityId: _project, taskEntityId: _task, ...fields } = input;
    if (task) Object.assign(task, fields);
  } else if (input.action === "deleteTask" || input.action === "moveTask") {
    const removed = new Set([input.taskEntityId]);
    for (let grew = true; grew;) {
      grew = false;
      for (const task of detail.tasks)
        if (
          task.parentTaskEntityId &&
          removed.has(task.parentTaskEntityId) &&
          !removed.has(task.entityId)
        ) {
          removed.add(task.entityId);
          grew = true;
        }
    }
    detail.tasks = detail.tasks.filter((task) => !removed.has(task.entityId));
  }
}

/**
 * Sends one POST /tasks/mutations and refreshes what the web refreshes. Resolves the returned
 * ID (the new task for createTask, else the task), or null.
 */
export async function writeTasks(world: World, input: TasksWrite) {
  const structural = input.action === "deleteTask" || input.action === "moveTask";
  const projectId = openProjectId();
  const taskId = openTaskId();
  // A structural reset removes the renderer's project data and its inspector. Detach here,
  // before the commit can publish hints; k6 has no render/unmount cycle or request cancellation.
  // Finish old reads first so they cannot reach a deleted task or an old project after commit.
  if (structural) await settleTask(world);
  const result = await call<{ id: string }>("tasks.mutations", { ...input });
  if (!result) {
    if (structural && projectId && taskId) await openTask(world, projectId, taskId);
    return null;
  }
  patchBoard(input, result.id);
  const detail = boards.get(input.projectEntityId);
  if (detail) applyBoard(world, detail);
  await invalidate(writeTargets(world.organizationId, input, result.id), "mutation");
  return result.id;
}

/** Inline edits patch the cached project at once (useTaskUpdate), then write. */
export function updateTask(world: World, task: Task, fields: TaskFields) {
  const detail = cached<ProjectDetail>(keys.project(world.organizationId, task.projectEntityId));
  const shown = detail?.tasks.find((row) => row.entityId === task.entityId);
  if (shown) Object.assign(shown, fields);
  return writeTasks(world, {
    action: "updateTask",
    projectEntityId: task.projectEntityId,
    taskEntityId: task.entityId,
    ...fields,
  });
}

/** One workspace search (queries/context/search.ts). The key holds the input, like the web's. */
async function searchWork(world: World, query: string, kind: "task" | "project", limit?: number) {
  const input = { query, kind, limit };
  const key = [...keys.search(world.organizationId), JSON.stringify(input)];
  const rows = await mount(key, () =>
    call<{ id: string; title: string }[]>("context.search", input),
  );
  unmount(key);
  return (rows ?? []).map((row) => ({ id: row.id, title: row.title, kind }));
}

/** The link picker (task-links.tsx): tasks only, 20 results. */
export function linkSearch(world: World, query: string) {
  return searchWork(world, query, "task", 20);
}
