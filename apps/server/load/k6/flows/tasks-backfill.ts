import { call } from "../lib/http.ts";
import { rng } from "../lib/persona.ts";
import { writeTasks, type TaskFields } from "../lib/screens/task-writes.ts";
import {
  applyProjects,
  assignableActors,
  boards,
  canComment,
  canEdit,
  loadBoard,
  type Project,
  type ProjectDetail,
} from "../lib/screens/tasks.ts";
import { comment, taskDescription, taskTitle, word } from "../lib/words.ts";
import type { World } from "../lib/world.ts";
import {
  dueDate,
  initialStatus,
  nextStatus,
  pickPriority,
  pickRelation,
  pickTask,
  skewed,
} from "./task-choices.ts";

/**
 * Backfill: no pauses and no socket, mostly writes. Reads happen only to learn IDs: the project
 * list once and a board when it is unknown, or now and then to see other users' tasks. A shared
 * ranking sends most writes to a few projects and most comments to a few tasks.
 */

let projects: Project[] = [];
const created = new Set<string>();

async function board(world: World, projectId: string) {
  const known = boards.get(projectId);
  if (known && !rng.chance(0.04)) return known;
  return (await loadBoard(world, projectId)) ?? known;
}

async function create(world: World, detail: ProjectDetail) {
  const parent = detail.tasks.length && rng.chance(0.25) ? skewed(detail.tasks, 1) : undefined;
  const assignees = assignableActors(detail);
  const fields: TaskFields & { title: string } = {
    title: taskTitle(),
    description: taskDescription(),
    status: initialStatus(true),
    priority: rng.chance(0.55) ? pickPriority() : "none",
    assigneeActorEntityId:
      assignees.length && rng.chance(0.5) ? rng.pick(assignees)!.entityId : null,
    dueDate: rng.chance(0.3) ? dueDate() : null,
  };
  const id = await writeTasks(world, {
    action: "createTask",
    projectEntityId: detail.project.entityId,
    parentTaskEntityId: parent?.entityId,
    attachmentFileIds: [],
    ...fields,
  });
  if (id) created.add(id);
}

async function update(world: World, detail: ProjectDetail) {
  const task = pickTask(detail.tasks, world.actorId, "update");
  if (!task) return;
  const roll = rng.next();
  const people = assignableActors(detail);
  let fields: TaskFields;
  if (roll < 0.6 || !people.length) fields = { status: nextStatus(task.status) };
  else if (roll < 0.75) fields = { assigneeActorEntityId: rng.pick(people)!.entityId };
  else if (roll < 0.85) fields = { priority: pickPriority() };
  else if (roll < 0.92) fields = { dueDate: dueDate() };
  else fields = { title: `${task.title} ${word()}`.slice(0, 300) };
  await writeTasks(world, {
    action: "updateTask",
    projectEntityId: detail.project.entityId,
    taskEntityId: task.entityId,
    ...fields,
  });
}

function referenceToken(world: World, detail: ProjectDetail) {
  const roll = rng.next();
  const people = assignableActors(detail).filter(
    (actor) => actor.type === "human" && actor.entityId !== world.actorId,
  );
  if (roll < 0.4 && people.length) return `@[person:${rng.pick(people)!.entityId}]`;
  const work = roll < 0.8 ? rng.pick(world.tasks) : rng.pick(world.projects);
  if (!work) return "";
  return `@[${work.projectEntityId ? "task" : "project"}:${work.entityId}]`;
}

async function commentOn(world: World, detail: ProjectDetail) {
  // Busy tasks collect long threads; the rest get a few comments.
  const task = rng.chance(0.7)
    ? skewed(detail.tasks, 1.3)
    : pickTask(detail.tasks, world.actorId, "comment");
  if (!task) return;
  let body = comment();
  if (rng.chance(0.15)) body = `${body} ${referenceToken(world, detail)}`.trim();
  const discussion = await call<{ conversationId: string }>("tasks.discussion", {
    projectEntityId: detail.project.entityId,
    taskEntityId: task.entityId,
  });
  if (discussion)
    await call("messaging.messages.send", {
      conversationId: discussion.conversationId,
      body,
      requestId: crypto.randomUUID(),
    });
}

async function link(world: World, detail: ProjectDetail) {
  const [task, other] = [rng.pick(detail.tasks), rng.pick(detail.tasks)];
  if (!task || !other || task.entityId === other.entityId) return;
  const ends = (id: string) =>
    detail.links.some(
      (row) =>
        (row.source?.entityId === id && row.target?.entityId === other.entityId) ||
        (row.target?.entityId === id && row.source?.entityId === other.entityId),
    );
  if (ends(task.entityId)) return;
  const linked = await writeTasks(world, {
    action: "addTaskLink",
    projectEntityId: detail.project.entityId,
    taskEntityId: task.entityId,
    relation: pickRelation(),
    otherTaskEntityId: other.entityId,
  });
  if (linked)
    detail.links.push({
      id: "",
      source: { entityId: task.entityId },
      target: { entityId: other.entityId },
    });
}

async function removeOwn(world: World, detail: ProjectDetail) {
  const task = rng.pick(detail.tasks.filter((row) => created.has(row.entityId)));
  if (!task) return;
  const target = { projectEntityId: detail.project.entityId, taskEntityId: task.entityId };
  const destination = rng.pick(
    [...boards.values()].filter((other) => other !== detail && canEdit(other)),
  );
  // A move must not leave an assignee without access; subtasks move along, so leaves only.
  const movable =
    destination &&
    !detail.tasks.some((row) => row.parentTaskEntityId === task.entityId) &&
    (!task.assigneeActorEntityId ||
      assignableActors(destination).some((actor) => actor.entityId === task.assigneeActorEntityId));
  if (destination && movable && rng.chance(0.4))
    await writeTasks(world, {
      action: "moveTask",
      ...target,
      destinationProjectEntityId: destination.project.entityId,
      parentTaskEntityId: null,
    });
  else if (await writeTasks(world, { action: "deleteTask", ...target }))
    created.delete(task.entityId);
}

export async function backfillTasks(world: World) {
  if (!projects.length || rng.chance(0.02)) {
    const rows = await call<Project[]>("tasks.projects");
    if (rows) {
      projects = rows;
      applyProjects(world, rows);
    }
  }
  const project = skewed(projects, 1.2);
  if (!project) return;
  const detail = await board(world, project.entityId);
  if (!detail) return;
  const writes = rng.int(3, 8);
  for (let write = 0; write < writes; write++) {
    const count = detail.tasks.length;
    if (!canEdit(detail)) {
      if (canComment(detail) && count) await commentOn(world, detail);
      continue;
    }
    const roll = rng.next() * 100;
    const creates = count < 15 ? 60 : 38;
    if (!count || roll < creates) await create(world, detail);
    else if (roll < creates + 28) await update(world, detail);
    else if (roll < creates + 56) await commentOn(world, detail);
    else if (roll < creates + 59) await link(world, detail);
    else await removeOwn(world, detail);
  }
}
