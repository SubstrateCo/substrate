import { call } from "../lib/http.ts";
import { readTime, think, typeTime } from "../lib/pacing.ts";
import { rng } from "../lib/persona.ts";
import {
  mentionSearch,
  openConversation,
  sendMessage,
  showMessaging,
} from "../lib/screens/messaging.ts";
import { linkSearch, updateTask, writeTasks, type TaskFields } from "../lib/screens/task-writes.ts";
import {
  assignableActors,
  closeMoveDialog,
  closeDiscussions,
  closeTask,
  openProject,
  openTask,
  openTaskId,
  showDiscussions,
  showTasks,
  showMoveDestination,
  canEdit,
  type ProjectDetail,
  type Task,
} from "../lib/screens/tasks.ts";
import { comment, taskDescription, taskTitle, typedPrefixes, word } from "../lib/words.ts";
import type { World } from "../lib/world.ts";
import {
  dueDate,
  initialStatus,
  nextStatus,
  pickPriority,
  pickRelation,
  pickTask,
} from "./task-choices.ts";

/** Live task steps: each one is what a person does in the tasks screen, with their pauses. */

/** Tasks this VU created, which it may later delete or move. */
export const created = new Set<string>();

/** Opens a task in the inspector if it is not open, and reads it. */
async function inspect(world: World, task: Task) {
  if (openTaskId() === task.entityId) return [];
  await think("glance");
  const { activity } = await openTask(world, task.projectEntityId, task.entityId);
  await readTime(1 + Math.min(activity, 4), task.description.length);
}

export async function readTask(world: World, detail: ProjectDetail) {
  const task = pickTask(detail.tasks, world.actorId, "read");
  if (!task) return;
  await inspect(world, task);
  if (rng.chance(0.6)) closeTask(world);
}

function otherHumans(world: World, detail: ProjectDetail) {
  return assignableActors(detail).filter(
    (actor) => actor.type === "human" && actor.entityId !== world.actorId,
  );
}

export async function createTask(world: World, detail: ProjectDetail) {
  const projectEntityId = detail.project.entityId;
  // "Add subtask" in the inspector of the parent; otherwise "New task" or a column's "+".
  const parent =
    detail.tasks.length >= 3 && rng.chance(0.7)
      ? pickTask(detail.tasks, world.actorId, "update")
      : undefined;
  if (parent) await inspect(world, parent);
  await think("decide");
  const title = taskTitle();
  await think("composeShort");
  await typeTime(title);
  const draft: TaskFields & { title: string } = {
    title,
    description: "",
    status: initialStatus(false),
    priority: "none",
    assigneeActorEntityId: null,
    dueDate: null,
  };
  const description = taskDescription();
  if (description) {
    await think(description.length > 200 ? "composeLong" : "composeShort");
    await typeTime(description);
    draft.description = description;
  }
  if (rng.chance(0.45)) {
    await think("glance");
    draft.priority = pickPriority();
  }
  const assignees = assignableActors(detail);
  if (assignees.length && rng.chance(0.35)) {
    await think("glance");
    const self = assignees.find((actor) => actor.entityId === world.actorId);
    draft.assigneeActorEntityId = (self && rng.chance(0.5) ? self : rng.pick(assignees)!).entityId;
  }
  if (rng.chance(0.25)) {
    await think("glance");
    draft.dueDate = dueDate();
  }
  const id = await writeTasks(world, {
    action: "createTask",
    projectEntityId,
    parentTaskEntityId: parent?.entityId,
    attachmentFileIds: [],
    ...draft,
  });
  if (!id) return;
  created.add(id);
  // The saved task opens in the inspector.
  await openTask(world, projectEntityId, id);
  await think("glance");
}

/** One change in the inspector or on the board. Resolves the task, or undefined. */
export async function updateOne(world: World, detail: ProjectDetail) {
  const task = pickTask(detail.tasks, world.actorId, "update");
  if (!task) return;
  if (openTaskId() !== task.entityId && rng.chance(0.05)) {
    // Board drag across columns or the list's status menu: an inline status change.
    await think("decide");
    await updateTask(world, task, { status: nextStatus(task.status) });
    return;
  }
  await inspect(world, task);
  await changeField(world, detail, task);
  if (rng.chance(0.25)) {
    await think("glance");
    await changeField(world, detail, task);
  }
}

async function changeField(world: World, detail: ProjectDetail, task: Task) {
  const roll = rng.next();
  const people = assignableActors(detail).filter(
    (actor) => actor.entityId !== task.assigneeActorEntityId,
  );
  if (roll < 0.4 || (roll < 0.58 && !people.length)) {
    await think("decide");
    return updateTask(world, task, { status: nextStatus(task.status) });
  }
  if (roll < 0.58) {
    await think("decide");
    const assignee =
      task.assigneeActorEntityId && rng.chance(0.15) ? null : rng.pick(people)!.entityId;
    return updateTask(world, task, { assigneeActorEntityId: assignee });
  }
  if (roll < 0.72) {
    await think("glance");
    return updateTask(world, task, { priority: pickPriority() });
  }
  if (roll < 0.82) {
    await think("glance");
    return updateTask(world, task, { dueDate: task.dueDate && rng.chance(0.2) ? null : dueDate() });
  }
  // The edit form: retitle or extend the description. Only changed fields are sent.
  await think("decide");
  if (rng.chance(0.4)) {
    const addition = ` ${word()} ${word()}`;
    await typeTime(addition);
    return updateTask(world, task, { title: `${task.title}${addition}`.slice(0, 300) });
  }
  const addition = taskDescription() || comment();
  await typeTime(addition);
  return updateTask(world, task, {
    description: task.description ? `${task.description}\n\n${addition}` : addition,
  });
}

/** Types "@" and part of a name or title; the picker searches as typing pauses; picks a row. */
async function reference(world: World, detail: ProjectDetail, task: Task, conversationId: string) {
  const people = otherHumans(world, detail);
  const roll = rng.next();
  const person = people.length && roll < 0.45 ? rng.pick(people)! : undefined;
  let work: World["projects"][number] | undefined;
  if (!person) {
    work =
      roll < 0.8
        ? rng.pick(world.tasks.filter((other) => other.entityId !== task.entityId))
        : rng.pick(world.projects);
  }
  const text = person?.name ?? work?.title ?? word();
  const query = text.slice(0, rng.int(3, Math.min(10, text.length)));
  let rows: Awaited<ReturnType<typeof mentionSearch>> = [];
  let typed = "@";
  for (const prefix of typedPrefixes(query)) {
    await typeTime(`@${prefix}`.slice(typed.length));
    typed = `@${prefix}`;
    rows = await mentionSearch(world, conversationId, prefix);
  }
  await think("glance");
  const choice =
    rows.find((row) => row.id === (person?.entityId ?? work?.entityId)) ??
    rng.pick(rows.filter((row) => row.kind !== "agent"));
  return choice ? `@[${choice.kind}:${choice.id}]` : "";
}

export async function commentOn(world: World, detail: ProjectDetail) {
  const task = pickTask(detail.tasks, world.actorId, "comment");
  if (!task) return;
  await inspect(world, task);
  const discussion = await call<{ conversationId: string }>("tasks.discussion", {
    projectEntityId: task.projectEntityId,
    taskEntityId: task.entityId,
  });
  if (!discussion) return;
  await showMessaging(world, discussion.conversationId);
  await openConversation(world, discussion.conversationId);
  const posts = rng.chance(0.2) ? 2 : 1;
  for (let post = 0; post < posts; post++) {
    let body = comment();
    await think(body.length > 200 ? "composeLong" : "composeShort");
    if (rng.chance(0.9)) {
      const words = body.split(" ");
      const at = rng.int(0, Math.min(words.length, 5));
      await typeTime(words.slice(0, at).join(" "));
      const token = await reference(world, detail, task, discussion.conversationId);
      await typeTime(words.slice(at).join(" "));
      body = [...words.slice(0, at), token, ...words.slice(at)].filter(Boolean).join(" ");
    } else await typeTime(body);
    await sendMessage(world, discussion.conversationId, body);
    if (post < posts - 1) await think("between");
  }
  await showTasks(world);
  await openProject(world, task.projectEntityId);
}

const linkedTo = (detail: ProjectDetail, taskId: string) =>
  new Set(
    detail.links.flatMap((link) =>
      link.source?.entityId === taskId || link.target?.entityId === taskId
        ? [link.source?.entityId, link.target?.entityId]
        : [],
    ),
  );

export async function linkTasks(world: World, detail: ProjectDetail) {
  const task = pickTask(detail.tasks, world.actorId, "update");
  if (!task) return;
  await inspect(world, task);
  const target = { projectEntityId: task.projectEntityId, taskEntityId: task.entityId };
  const own = detail.links.filter(
    (link) => link.source?.entityId === task.entityId || link.target?.entityId === task.entityId,
  );
  if (own.length && rng.chance(0.9)) {
    await think("decide");
    await writeTasks(world, { action: "removeTaskLink", ...target, linkId: rng.pick(own)!.id });
    return;
  }
  const linked = linkedTo(detail, task.entityId);
  linked.add(task.entityId);
  // Usually a task from the same board, sometimes one seen elsewhere.
  const candidates = rng.chance(0.75)
    ? detail.tasks.filter((other) => !linked.has(other.entityId))
    : world.tasks.filter((other) => !linked.has(other.entityId));
  const wanted = rng.pick(candidates);
  await think("glance");
  // Opening the picker settles an empty query first.
  let rows = await linkSearch(world, "");
  const relation = pickRelation();
  if (relation !== "blocked_by") await think("glance");
  const words = (wanted?.title ?? word()).split(" ");
  const query = words.slice(1, 1 + rng.int(1, 2)).join(" ") || words[0]!;
  let typed = "";
  for (const prefix of typedPrefixes(query)) {
    await typeTime(prefix.slice(typed.length));
    typed = prefix;
    rows = await linkSearch(world, prefix);
  }
  await think("glance");
  const usable = rows.filter((row) => !linked.has(row.id));
  const choice = usable.find((row) => row.id === wanted?.entityId) ?? rng.pick(usable);
  if (!choice) return;
  await writeTasks(world, {
    action: "addTaskLink",
    ...target,
    relation,
    otherTaskEntityId: choice.id,
  });
}

/** The Discussions tab, read, then back to Tasks. */
export async function readDiscussions(world: World) {
  await think("glance");
  const rows = await showDiscussions(world);
  await readTime(Math.max(1, rows.length), rows.length * 120);
  closeDiscussions(world);
  await think("glance");
}

/** "Move" in the task menu: choose another project, maybe a parent there, move, follow the task. */
export async function moveTask(world: World, detail: ProjectDetail) {
  const destinations = world.projects.filter(
    (project) => project.entityId !== detail.project.entityId,
  );
  const mine = detail.tasks.filter((task) => created.has(task.entityId));
  const task = rng.pick(mine.length && rng.chance(0.6) ? mine : detail.tasks);
  const destination = rng.pick(destinations);
  if (!task || !destination) return;
  await inspect(world, task);
  await think("glance");
  const other = await showMoveDestination(world, destination.entityId);
  await think("decide");
  if (!other || !canEdit(other)) return closeMoveDialog(world, destination.entityId);
  // The server refuses a move that leaves an assignee without access. The person unassigns the
  // task, or gives up when a subtask is in the way.
  const reachable = new Set(assignableActors(other).map((actor) => actor.entityId));
  const blocked = (row: Task) =>
    !!row.assigneeActorEntityId && !reachable.has(row.assigneeActorEntityId);
  const moving = new Set([task.entityId]);
  for (let grew = true; grew;) {
    grew = false;
    for (const row of detail.tasks)
      if (row.parentTaskEntityId && moving.has(row.parentTaskEntityId) && !moving.has(row.entityId))
        grew = !!moving.add(row.entityId);
  }
  if (detail.tasks.some((row) => row !== task && moving.has(row.entityId) && blocked(row)))
    return closeMoveDialog(world, destination.entityId);
  if (blocked(task)) {
    await think("decide");
    if (!(await updateTask(world, task, { assigneeActorEntityId: null })))
      return closeMoveDialog(world, destination.entityId);
    await think("glance");
  }
  const parent = rng.chance(0.2) ? rng.pick(other.tasks) : undefined;
  if (parent) await think("glance");
  const moved = await writeTasks(world, {
    action: "moveTask",
    projectEntityId: detail.project.entityId,
    taskEntityId: task.entityId,
    destinationProjectEntityId: destination.entityId,
    parentTaskEntityId: parent?.entityId ?? null,
  });
  if (!moved) return closeMoveDialog(world, destination.entityId);
  await openProject(world, destination.entityId);
  await openTask(world, destination.entityId, task.entityId);
  await think("glance");
}

/** Deletes a task the user created here, after the confirm dialog. */
export async function deleteOwn(world: World, detail: ProjectDetail) {
  const task = rng.pick(detail.tasks.filter((row) => created.has(row.entityId)));
  if (!task) return;
  await inspect(world, task);
  await think("decide");
  const deleted = await writeTasks(world, {
    action: "deleteTask",
    projectEntityId: task.projectEntityId,
    taskEntityId: task.entityId,
  });
  if (deleted) created.delete(task.entityId);
  closeTask(world);
}
