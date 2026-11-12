import { cached, currentView } from "../lib/client-cache.ts";
import { config } from "../lib/config.ts";
import { trace } from "../lib/debug.ts";
import { keys } from "../lib/keys.ts";
import { readTime, think } from "../lib/pacing.ts";
import { persona, rng } from "../lib/persona.ts";
import {
  boards,
  canComment,
  canEdit,
  closeTask,
  openProject,
  openProjectId,
  showTasks,
  type Project,
  type ProjectDetail,
} from "../lib/screens/tasks.ts";
import type { World } from "../lib/world.ts";
import type { FlowContext } from "./flow.ts";
import {
  commentOn,
  createTask,
  created,
  deleteOwn,
  linkTasks,
  moveTask,
  readDiscussions,
  readTask,
  updateOne,
} from "./task-steps.ts";
import { backfillTasks } from "./tasks-backfill.ts";

const minute = 60_000;
// When this VU last worked in each project.
const touched = new Map<string, number>();

/** Projects the user worked in lately first, then busy ones. */
function chooseProject(projects: Project[]) {
  const now = Date.now();
  return rng.weighted(projects, (project) => {
    const since = now - (touched.get(project.entityId) ?? -Infinity);
    const size = boards.get(project.entityId)?.tasks.length ?? 4;
    let weight = 1 + Math.sqrt(size) / 2;
    if (since < 30 * minute) weight += 8;
    else if (since < 2 * 60 * minute) weight += 3;
    return weight;
  });
}

type Step = (world: World, detail: ProjectDetail) => Promise<void | boolean>;

/** Step weights for one board. A new or small board gets more creates, a grown one more updates. */
function chooseStep(world: World, detail: ProjectDetail): Step | undefined {
  const count = detail.tasks.length;
  const small = count < 8;
  const edit = canEdit(detail);
  const some = count > 0;
  const mine = detail.tasks.some((task) => created.has(task.entityId));
  const createWeight = small ? 30 : 12;
  const steps: [Step, number][] = [
    [readTask, some ? 30 : 0],
    [createTask, edit ? createWeight : 0],
    [updateOne, edit && some ? 25 : 0],
    [commentOn, canComment(detail) && some ? 20 : 0],
    [linkTasks, edit && count >= 2 ? 5 : 0],
    [readDiscussions, 6],
    [moveTask, edit && some && world.projects.length > 1 ? 2 : 0],
    [deleteOwn, edit && mine ? 1 : 0],
  ];
  return rng.weighted(steps, ([, weight]) => weight)?.[0];
}

const current = (world: World) => {
  const projectId = openProjectId();
  return projectId
    ? cached<ProjectDetail>(keys.project(world.organizationId, projectId))
    : undefined;
};

/**
 * Tasks (weight 20; backfill 30): open the tasks view, which shows the first project, maybe
 * switch to a project the user works in, scan the board, then take a few steps with pauses:
 * read a task, create one or a subtask, change a status, assignee or field, comment (sometimes
 * mentioning a person or work), link tasks, read the project's discussions, and rarely move or
 * delete a task.
 */
export async function tasks({ world }: FlowContext) {
  if (config.mode === "backfill") return backfillTasks(world);
  const arriving = currentView() !== "tasks";
  const projects = await showTasks(world);
  if (!projects.length) {
    // The empty state: a look, then elsewhere.
    await think(arriving ? "navigate" : "glance");
    return;
  }
  // The route has no project when arriving, so the first one opens.
  if (arriving || !openProjectId()) await openProject(world, projects[0]!.entityId);
  await think(arriving ? "navigate" : "glance");
  const chosen = chooseProject(projects)!;
  if (chosen.entityId !== openProjectId()) {
    await openProject(world, chosen.entityId);
    await think("glance");
  }
  let detail = current(world);
  if (!detail) return;
  const shown = detail.tasks.slice(0, 25);
  await readTime(
    shown.length,
    shown.reduce((sum, task) => sum + task.title.length, 0),
  );
  const count = rng.weighted(
    [1, 2, 3, 4, 5],
    (n) => [25, 30, 22, 13 * persona.activity, 10 * persona.activity][n - 1]!,
  )!;
  for (let step = 0; step < count; step++) {
    const action = chooseStep(world, detail);
    if (!action) break;
    touched.set(detail.project.entityId, Date.now());
    trace("step", action.name);
    await action(world, detail);
    detail = current(world);
    if (!detail) return;
    if (step < count - 1) await think("between");
  }
  if (rng.chance(0.5)) closeTask(world);
}
