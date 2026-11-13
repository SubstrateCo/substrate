import { currentView, mount, navigate, settleInactive, unmount } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys } from "../keys.ts";
import { applyConversations, type Conversation, type World } from "../world.ts";
import { hidePictures, showPictures } from "./pictures.ts";

/**
 * The tasks screen as the web renders it (components/tasks/...): the project list, one project
 * pane, its Discussions tab, and the task inspector. Each function mounts what its pane mounts,
 * through the cache. Writes are in task-writes.ts.
 */

export type TaskStatus = "not_started" | "in_progress" | "in_review" | "completed" | "canceled";
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";
export type Level = "view" | "comment" | "edit" | "owner";

export interface Project {
  entityId: string;
  name: string;
  description: string;
  image: string | null;
}

export interface Task {
  entityId: string;
  projectEntityId: string;
  parentTaskEntityId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeActorEntityId: string | null;
  dueDate: string | null;
}

interface LinkEnd {
  entityId: string;
}

interface TaskLink {
  id: string;
  source: LinkEnd | null;
  target: LinkEnd | null;
}

export interface ProjectDetail {
  project: Project;
  level: Level;
  members: { actorEntityId: string; type: "human" | "agent"; image: string | null }[];
  actors: {
    entityId: string;
    name: string;
    type: "human" | "agent";
    assignable: boolean;
    image: string | null;
  }[];
  tasks: Task[];
  links: TaskLink[];
}

export const canEdit = (detail: ProjectDetail) =>
  detail.level === "edit" || detail.level === "owner";
export const canComment = (detail: ProjectDetail) => detail.level !== "view";

/** assignee/assignable.ts: people need direct project access; agents use their owner's. */
export function assignableActors(detail: ProjectDetail) {
  return detail.actors.filter(
    (actor) =>
      actor.assignable &&
      (actor.type === "agent" ||
        detail.members.some((member) => member.actorEntityId === actor.entityId)),
  );
}

// What the tasks screen shows now.
interface TaskScreen {
  projectId?: string;
  taskId?: string;
  discussions?: boolean;
}
const screen: TaskScreen = {};

/** The latest detail per project this client loaded or changed. Backfill reads it instead of the cache. */
export const boards = new Map<string, ProjectDetail>();

export function openProjectId() {
  return screen.projectId;
}

export function openTaskId() {
  return screen.taskId;
}

export function applyProjects(world: World, rows: Project[]) {
  world.projects = rows.map((row) => ({ entityId: row.entityId, title: row.name }));
  const accessible = new Set(rows.map((row) => row.entityId));
  for (const id of boards.keys()) if (!accessible.has(id)) boards.delete(id);
  world.tasks = world.tasks.filter(
    (task) => task.projectEntityId && accessible.has(task.projectEntityId),
  );
}

export function resetTaskScreen() {
  boards.clear();
  screen.projectId = screen.taskId = undefined;
  screen.discussions = false;
}

/** Keeps the world's task list in step with one project's board. */
export function applyBoard(world: World, detail: ProjectDetail) {
  const projectId = detail.project.entityId;
  boards.set(projectId, detail);
  world.tasks = world.tasks
    .filter((task) => task.projectEntityId !== projectId)
    .concat(
      detail.tasks.map((task) => ({
        entityId: task.entityId,
        title: task.title,
        projectEntityId: projectId,
      })),
    );
}

/** The project list (tasks-workspace.tsx). Resolves the projects. */
export async function showTasks(world: World) {
  // Coming from another view, the route has no project or task, and nothing here is mounted.
  if (currentView() !== "tasks") {
    screen.projectId = screen.taskId = undefined;
    screen.discussions = false;
  }
  navigate("tasks");
  const rows = await mount(keys.projects(world.organizationId), async () => {
    const projects = await call<Project[]>("tasks.projects");
    if (projects) applyProjects(world, projects);
    return projects;
  });
  // The project sidebar shows each project's icon.
  await showPictures(
    "projects",
    world.organizationId,
    (rows ?? []).map((row) => row.image),
  );
  return rows ?? [];
}

/** The board's project icon and the avatars of task assignees on its cards. */
function boardPictures(detail: ProjectDetail) {
  const assignees = new Set(detail.tasks.map((task) => task.assigneeActorEntityId));
  return [
    detail.project.image,
    ...detail.actors.filter((actor) => assignees.has(actor.entityId)).map((actor) => actor.image),
  ];
}

function projectFetcher(world: World, projectId: string) {
  return async () => {
    const detail = await call<ProjectDetail>("tasks.project", { projectEntityId: projectId });
    if (detail) applyBoard(world, detail);
    return detail;
  };
}

/** Reads a board without the cache, as backfill does to learn task IDs. */
export async function loadBoard(world: World, projectId: string) {
  return (await projectFetcher(world, projectId)()) ?? undefined;
}

/** Opens a project pane (project-pane.tsx) on its Tasks tab. Resolves the detail. */
export async function openProject(world: World, projectId: string) {
  if (screen.projectId !== projectId) {
    closeTask(world);
    closeDiscussions(world);
    if (screen.projectId) unmount(keys.project(world.organizationId, screen.projectId));
    screen.projectId = projectId;
  }
  const detail = await mount(
    keys.project(world.organizationId, projectId),
    projectFetcher(world, projectId),
  );
  if (detail) await showPictures("board", projectId, boardPictures(detail));
  return detail;
}

/** Back to the project list, as after deleting the open project. */
export function closeProject(world: World) {
  if (!screen.projectId) return;
  closeTask(world);
  closeDiscussions(world);
  unmount(keys.project(world.organizationId, screen.projectId));
  boards.delete(screen.projectId);
  screen.projectId = undefined;
  hidePictures("board");
}

function mountConversations(world: World) {
  return mount(keys.conversations(world.organizationId), async () => {
    const rows = await call<Conversation[]>("messaging.conversations");
    if (rows) applyConversations(world, rows);
    return rows;
  });
}

/** The Discussions tab (work-discussions.tsx): messages that link the project. */
export async function showDiscussions(world: World) {
  const projectId = screen.projectId;
  if (!projectId) return [];
  closeTask(world);
  screen.discussions = true;
  const [rows] = await Promise.all([
    mount(keys.related(world.organizationId, projectId), () =>
      call<unknown[]>("context.related", { entityId: projectId }),
    ),
    mountConversations(world),
  ]);
  return rows ?? [];
}

export function closeDiscussions(world: World) {
  if (!screen.discussions || !screen.projectId) return;
  unmount(keys.related(world.organizationId, screen.projectId));
  unmount(keys.conversations(world.organizationId));
  screen.discussions = false;
}

/**
 * Opens the task inspector (task-detail.tsx). Selecting a task puts its ID in the URL, so the
 * workspace also mounts its location. Discussions open separately in messaging.
 */
export async function openTask(world: World, projectId: string, taskId: string) {
  // A search or notification can outlive a move/delete. The loaded board is the route's truth.
  if (!boards.get(projectId)?.tasks.some((task) => task.entityId === taskId))
    return { activity: 0, available: false };
  if (screen.taskId !== taskId) closeTask(world);
  closeDiscussions(world);
  screen.taskId = taskId;
  const org = world.organizationId;
  const target = { projectEntityId: projectId, taskEntityId: taskId };
  const [activity] = await Promise.all([
    mount(keys.activity(org, taskId), () =>
      call<unknown[]>("context.activity", { entityId: taskId }),
    ),
    mount(keys.taskLocation(org, taskId), () =>
      call("tasks.taskLocation", { taskEntityId: taskId }),
    ),
    mount(keys.taskAttachments(org, projectId, taskId), () =>
      call("files.taskAttachments", target),
    ),
    mount(keys.related(org, taskId), () => call("context.related", { entityId: taskId })),
    mountConversations(world),
  ]);
  await showPictures("task", taskId, [boards.get(projectId)?.project.image]);
  return { activity: activity?.length ?? 0, available: true };
}

function inspectorKeys(world: World) {
  const { projectId, taskId } = screen;
  if (!projectId || !taskId) return [];
  const org = world.organizationId;
  return [
    keys.activity(org, taskId),
    keys.taskLocation(org, taskId),
    keys.taskAttachments(org, projectId, taskId),
    keys.related(org, taskId),
    keys.conversations(org),
  ];
}

export function closeTask(world: World) {
  for (const key of inspectorKeys(world)) unmount(key);
  screen.taskId = undefined;
  hidePictures("task");
}

/** Detaches the inspector and finishes its old reads before moving or deleting work. */
export async function settleTask(world: World) {
  const queries = inspectorKeys(world);
  closeTask(world);
  await settleInactive(queries);
}

/**
 * The move dialog (task-move-dialog.tsx) loads the project list and each destination the person
 * picks. Resolves the destination detail; the dialog's queries unmount when it closes.
 */
export async function showMoveDestination(world: World, destinationId: string) {
  return mount(
    keys.project(world.organizationId, destinationId),
    projectFetcher(world, destinationId),
  );
}

export function closeMoveDialog(world: World, destinationId: string) {
  if (destinationId !== screen.projectId)
    unmount(keys.project(world.organizationId, destinationId));
}
