import { config } from "../lib/config.ts";
import { readTime, think, typeTime } from "../lib/pacing.ts";
import { rng } from "../lib/persona.ts";
import {
  attachToTask,
  openTaskAttachment,
  removeTaskAttachment,
  sendWithFiles,
  showTaskAttachments,
  uploadFile,
} from "../lib/screens/files.ts";
import { openConversation, showMessaging } from "../lib/screens/messaging.ts";
import { pickPicture } from "../lib/screens/pictures.ts";
import { deleteProject, setProjectPicture, writeProject } from "../lib/screens/projects.ts";
import { showSettings, type SettingsPage } from "../lib/screens/settings.ts";
import {
  boards,
  canEdit,
  closeProject,
  loadBoard,
  openProject,
  openTask,
  showTasks,
  type ProjectDetail,
} from "../lib/screens/tasks.ts";
import { uploadPicture } from "../lib/upload.ts";
import { taskDescription, word } from "../lib/words.ts";
import { joinedConversations, type World } from "../lib/world.ts";
import { isOwner } from "./rare-sharing.ts";

/** Projects, files and settings in the rare flow. */

const backfill = config.mode === "backfill";
const suffixes = [
  "Launch",
  "Plan",
  "Migration",
  "Review",
  "Roadmap",
  "Pilot",
  "Rollout",
  "Research",
  "Cleanup",
  "Program",
];
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// What this VU changed, so it only undoes its own shares and attachments.
const shares: { projectId: string; actorEntityId: string }[] = [];
const attached: { projectEntityId: string; taskEntityId: string; fileId: string }[] = [];
export const ownProjects: string[] = [];

/** A project from the tasks screen; backfill reads a board directly. */
async function pickProject(world: World, wanted: (detail: ProjectDetail) => boolean) {
  const known = [...boards.values()].filter(wanted);
  if (backfill) {
    if (known.length && rng.chance(0.8)) return rng.pick(known);
    const projects = await showTasks(world);
    const project = rng.pick(projects);
    const detail = project && (await loadBoard(world, project.entityId));
    return detail && wanted(detail) ? detail : rng.pick(known);
  }
  const projects = await showTasks(world);
  await think("glance");
  const preferred = projects.filter((project) => {
    const detail = boards.get(project.entityId);
    return !detail || wanted(detail);
  });
  const project = rng.pick(preferred);
  if (!project) return undefined;
  const detail = await openProject(world, project.entityId);
  if (detail) await readTime(Math.min(detail.tasks.length, 8) + 1);
  return detail && wanted(detail) ? detail : undefined;
}

export async function createProject(world: World) {
  if (!backfill) {
    await showTasks(world);
    await think("decide");
  }
  const name = `${capital(word())} ${capital(word())} ${rng.pick(suffixes)!}`;
  const description = taskDescription();
  await think("composeShort");
  await typeTime(name);
  if (description) await typeTime(description);
  const id = await writeProject(world, {
    action: "createProject",
    name,
    description: description || undefined,
  });
  if (id) ownProjects.push(id);
  if (id && !backfill) {
    await openProject(world, id);
    await think("glance");
  }
}

/** Deletes a project it created in this session, from the project editor's danger zone. */
export async function deleteOwnProject(world: World) {
  const projectId = rng.pick(ownProjects);
  if (!projectId) return;
  await showTasks(world);
  const detail = await openProject(world, projectId);
  await think("decide");
  // The confirm dialog.
  await think("glance");
  if (detail?.level === "owner") {
    closeProject(world);
    if (!(await deleteProject(world, projectId))) return;
  }
  ownProjects.splice(ownProjects.indexOf(projectId), 1);
}

/** Picks an image in the project editor's picture field; it uploads and saves at once. */
export async function changeProjectIcon(world: World) {
  const detail = await pickProject(world, canEdit);
  if (!detail) return;
  await think("decide");
  const projectEntityId = detail.project.entityId;
  const url = await uploadPicture("project-icon", pickPicture(), {
    organizationId: world.organizationId,
    projectEntityId,
  });
  if (url && (await setProjectPicture(world, projectEntityId, url)))
    await openProject(world, projectEntityId);
}

export async function updateProject(world: World) {
  const detail = await pickProject(world, canEdit);
  // Projects are private until shared; someone with none of their own starts one.
  if (!detail) return createProject(world);
  await think("decide");
  const { project } = detail;
  const rename = rng.chance(0.4);
  const addition = ` ${word()} ${word()}.`;
  const name = rename
    ? `${project.name.split(" ").slice(0, 3).join(" ")} ${rng.pick(suffixes)!}`
    : project.name;
  await typeTime(rename ? name : addition);
  await writeProject(world, {
    action: "updateProject",
    projectEntityId: project.entityId,
    name,
    description: rename
      ? project.description
      : `${project.description}${addition}`.slice(0, 20_000),
  });
}

/** The share dialog: find a person by name, pick a level, confirm. */
export async function shareProject(world: World) {
  const detail = await pickProject(world, (board) => board.level === "owner");
  if (!detail) return createProject(world);
  const members = new Set(detail.members.map((member) => member.actorEntityId));
  const person = rng.pick(
    detail.actors.filter((actor) => actor.type === "human" && !members.has(actor.entityId)),
  );
  if (!person) return;
  await think("glance");
  await typeTime(person.name.slice(0, rng.int(3, 6)));
  await think("glance");
  const level = rng.weighted(
    ["view", "comment", "edit"] as const,
    (value) => ({ view: 3, comment: 3, edit: 4 })[value],
  )!;
  const projectId = detail.project.entityId;
  if (
    await writeProject(world, {
      action: "share",
      projectEntityId: projectId,
      actorEntityId: person.entityId,
      level,
    })
  )
    shares.push({ projectId, actorEntityId: person.entityId });
}

export async function revokeShare(world: World) {
  const share = rng.pick(shares);
  if (!share) return shareProject(world);
  if (!backfill) {
    await showTasks(world);
    await openProject(world, share.projectId);
    await think("decide");
  }
  if (
    await writeProject(world, {
      action: "revoke",
      projectEntityId: share.projectId,
      actorEntityId: share.actorEntityId,
    })
  )
    shares.splice(shares.indexOf(share), 1);
}

/** Opens a task in a project the person can edit, as attaching needs. */
async function pickTask(world: World, editable: boolean) {
  const detail = await pickProject(
    world,
    (board) => board.tasks.length > 0 && (!editable || canEdit(board)),
  );
  const task = detail && rng.pick(detail.tasks);
  if (!detail || !task) return undefined;
  const target = { projectEntityId: detail.project.entityId, taskEntityId: task.entityId };
  if (!backfill) {
    await think("glance");
    const { comments } = await openTask(world, target.projectEntityId, target.taskEntityId);
    await readTime(comments.length + 1, task.description.length);
  }
  return target;
}

async function uploads() {
  const ids: string[] = [];
  const count = rng.chance(0.8) ? 1 : 2;
  for (let index = 0; index < count; index++) {
    const id = await uploadFile();
    if (id) ids.push(id);
  }
  return ids;
}

/** Drops files on a task's attachment list. Without an editable task, sends them in a message. */
export async function uploadToTask(world: World) {
  const target = await pickTask(world, true);
  if (!target) return uploadToMessage(world);
  const fileIds = await uploads();
  if (!fileIds.length || !(await attachToTask(world, target, fileIds))) return;
  for (const fileId of fileIds) attached.push({ ...target, fileId });
  if (attached.length > 20) attached.shift();
}

export async function uploadToMessage(world: World) {
  await showMessaging(world);
  const open = joinedConversations(world).find((row) => row.id === world.screen.conversationId);
  const conversation = open && rng.chance(0.6) ? open : rng.pick(joinedConversations(world));
  if (!conversation) return;
  if (!backfill) {
    const { messages } = await openConversation(world, conversation.id);
    await readTime(Math.min(messages.length, 4), 300);
  }
  const fileIds = await uploads();
  if (!fileIds.length) return;
  const body = rng.chance(0.55)
    ? `${rng.pick(["here it is", "attached", "fyi", "latest version", "see attached"])!} ${word()}`
    : "";
  if (body) await typeTime(body);
  await sendWithFiles(world, conversation.id, body, fileIds);
}

/** Looks through a task's attachments, opens one, and rarely removes one it added. */
export async function browseAttachments(world: World) {
  const own = rng.chance(0.4) ? rng.pick(attached) : undefined;
  const target = own ?? (await pickTask(world, false));
  if (!target) return;
  if (own && !backfill) {
    await showTasks(world);
    await openProject(world, own.projectEntityId);
    await openTask(world, own.projectEntityId, own.taskEntityId);
  }
  const rows = await showTaskAttachments(world, target);
  if (!rows.length) return;
  if (!backfill)
    await readTime(
      rows.length,
      rows.reduce((sum, row) => sum + row.filename.length, 0),
    );
  const mine = own && rows.find((row) => row.fileId === own.fileId);
  if (mine && rng.chance(0.3)) {
    await think("decide");
    if (await removeTaskAttachment(world, target, mine.id))
      attached.splice(attached.indexOf(own), 1);
    return;
  }
  await think("glance");
  const row = rng.pick(rows)!;
  await openTaskAttachment(world, target, row.id);
  if (!backfill) await think("read");
}

/** A look at settings: everyone has profile and their invitations; owners see organization pages. */
export async function browseSettings(world: World) {
  const pages: SettingsPage[] = isOwner(world)
    ? ["members", "invitations", "conversations", "sharing", "profile"]
    : ["profile", "your-invitations"];
  await think("navigate");
  const visits = rng.int(1, Math.min(3, pages.length));
  for (let visit = 0; visit < visits; visit++) {
    const rows = await showSettings(world, rng.pick(pages)!);
    await readTime(Math.min(rows, 20) + 1);
  }
}
