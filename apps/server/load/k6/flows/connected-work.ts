import { mount } from "../lib/client-cache.ts";
import { config } from "../lib/config.ts";
import { call } from "../lib/http.ts";
import { keys } from "../lib/keys.ts";
import { readTime, think, typeTime } from "../lib/pacing.ts";
import { rng } from "../lib/persona.ts";
import {
  createTaskFromMessage,
  linkWork,
  messageDetails,
  mountProjects,
  openLinkPicker,
  showLinkedWork,
  unlinkWork,
  type LinkableWork,
} from "../lib/screens/connected-work.ts";
import { openConversation, showMessaging } from "../lib/screens/messaging.ts";
import { applyBoard, boards, canEdit, type ProjectDetail } from "../lib/screens/tasks.ts";
import { taskTitle, word } from "../lib/words.ts";
import {
  applyLatestMessages,
  joinedConversations,
  type Message,
  type World,
} from "../lib/world.ts";
import type { FlowContext } from "./flow.ts";

const backfill = config.mode === "backfill";
const minute = 60_000;

/** Links this VU made, for removal and for opening linked work later. */
const links: { conversationId: string; messageId: string; work: LinkableWork }[] = [];

function remember(conversationId: string, messageId: string, work: LinkableWork) {
  links.push({ conversationId, messageId, work });
  if (links.length > 30) links.shift();
}

/** The open conversation most of the time; otherwise a recently active one. */
function chooseConversation(world: World) {
  const open = joinedConversations(world).find((row) => row.id === world.screen.conversationId);
  if (open && rng.chance(0.6)) return open;
  const now = Date.now();
  return rng.weighted(joinedConversations(world), (conversation) => {
    const idle = now - (world.activity.get(conversation.id) ?? 0);
    if (idle < 10 * minute) return 4;
    return idle < 60 * minute ? 2 : 1;
  });
}

async function latest(world: World, conversationId: string) {
  if (!backfill) return (await openConversation(world, conversationId)).messages;
  const cached = world.messages.get(conversationId);
  if (cached?.length && !rng.chance(0.1)) return cached;
  const rows = await call<Message[]>("messaging.messages", { conversationId });
  if (rows) applyLatestMessages(world, conversationId, rows);
  return rows ?? [];
}

/** Longer messages from others read like requests; those get turned into work. */
function chooseMessage(world: World, messages: Message[]) {
  const recent = messages
    .slice(-30)
    .filter((message) => !message.deletedAt && message.body.length > 0);
  return rng.weighted(recent, (message) => {
    const mine = message.authorActorEntityId === world.actorId ? 0.6 : 1;
    return (
      mine * (1 + Math.min(message.body.length, 400) / 80) * (1 + recent.indexOf(message) / 10)
    );
  });
}

/** A project the person can add tasks to: known boards first, else the list and one detail. */
async function editableProject(world: World) {
  const known = [...boards.values()].filter(canEdit);
  if (known.length && rng.chance(0.75)) return rng.pick(known)!.project.entityId;
  const projects = await mountProjects(world);
  const project = rng.pick(projects);
  if (!project) return rng.pick(known)?.project.entityId;
  const detail = await mount(keys.project(world.organizationId, project.entityId), async () => {
    const row = await call<ProjectDetail>("tasks.project", { projectEntityId: project.entityId });
    if (row) applyBoard(world, row);
    return row;
  });
  return detail && canEdit(detail) ? project.entityId : rng.pick(known)?.project.entityId;
}

/** "Create task" from a message's menu: choose the project, type a title, save. */
async function createTask(world: World, conversationId: string, message: Message) {
  await think("glance");
  const projectId = await editableProject(world);
  if (!projectId) return linkToWork(world, conversationId, message);
  if (!backfill) await think("decide");
  const title = rng.chance(0.4)
    ? message.body
        .split(/[.!?\n]/)[0]!
        .slice(0, 120)
        .trim() || taskTitle()
    : taskTitle();
  await think("composeShort");
  await typeTime(title);
  const work = await createTaskFromMessage(world, conversationId, message.id, projectId, title);
  if (!work) return;
  if (!backfill && rng.chance(0.5)) {
    await think("glance");
    const panel = await showLinkedWork(world, work);
    await readTime(panel.rows + 1);
    panel.close();
  }
}

/** "Link work": search tasks or projects the person can edit, pick one not linked yet, link it. */
async function linkToWork(world: World, conversationId: string, message: Message) {
  await think("glance");
  const kind = rng.chance(0.75) ? "task" : "project";
  const known = kind === "task" ? world.tasks : world.projects;
  const hint =
    rng
      .pick(known)
      ?.title.split(" ")
      .find((part) => part.length > 3) ?? (rng.chance(0.5) ? word() : "");
  const text = hint.slice(0, rng.int(3, Math.max(3, Math.min(8, hint.length)))).toLowerCase();
  const picker = await openLinkPicker(world, kind, backfill ? "" : text);
  const linked = new Set(
    links.flatMap((row) => (row.messageId === message.id ? [row.work.id] : [])),
  );
  const choice = rng.pick(picker.rows.slice(0, 8).filter((row) => !linked.has(row.id)));
  if (!backfill) await (choice ? think("decide") : think("glance"));
  picker.close();
  if (!choice) return;
  if (await linkWork(world, conversationId, message.id, choice))
    remember(conversationId, message.id, choice);
}

/** The linked-work card's remove button on a link this person made. */
async function unlink(world: World) {
  const link = rng.pick(links);
  if (!link) return;
  if (!backfill) {
    await openConversation(world, link.conversationId);
    await think("decide");
  }
  if (await unlinkWork(world, link.conversationId, link.messageId, link.work))
    links.splice(links.indexOf(link), 1);
}

/** Opens linked work from a message: its discussions and, for a task, its history. */
async function readLinked(world: World, message: Message) {
  const own = rng.pick(links);
  const task = rng.pick(world.tasks);
  const project = rng.pick(world.projects);
  const work: LinkableWork | undefined =
    own?.work ??
    (task && task.projectEntityId
      ? {
          id: task.entityId,
          title: task.title,
          projectEntityId: task.projectEntityId,
          kind: "task",
        }
      : project && {
          id: project.entityId,
          title: project.title,
          projectEntityId: project.entityId,
          kind: "project",
        });
  if (rng.chance(0.15)) await messageDetails(message.id);
  if (!work) return;
  await think("glance");
  const panel = await showLinkedWork(world, work);
  await readTime(panel.rows + 1, panel.rows * 120);
  panel.close();
}

/**
 * Connected work (weight 3; backfill 6): in a conversation, read a message, decide, then create
 * a task from it, link it to existing work, rarely remove a link, or read linked work.
 */
export async function connectedWork({ world }: FlowContext) {
  if (!backfill) await showMessaging(world);
  const conversation = chooseConversation(world);
  if (!conversation) return;
  const messages = await latest(world, conversation.id);
  const message = chooseMessage(world, messages);
  if (!message) return;
  if (!backfill) {
    await readTime(Math.min(messages.length, 5), 300);
    await readTime(1, message.body.length);
    await think("decide");
  }
  const roll = rng.next();
  if (roll < 0.35) await createTask(world, conversation.id, message);
  else if (roll < 0.7) await linkToWork(world, conversation.id, message);
  else if (roll < 0.78 && links.length) await unlink(world);
  else if (backfill) await linkToWork(world, conversation.id, message);
  else await readLinked(world, message);
}
