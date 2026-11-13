import { mount } from "../lib/client-cache.ts";
import { config } from "../lib/config.ts";
import { call } from "../lib/http.ts";
import { keys } from "../lib/keys.ts";
import { readTime, think, typeTime } from "../lib/pacing.ts";
import { pickResource, rng } from "../lib/persona.ts";
import {
  createTaskFromMessage,
  linkWork,
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
  conversationKey,
  joinedConversations,
  linkedWorkForMessage,
  type Message,
  type World,
} from "../lib/world.ts";
import { FlowSkipped, type FlowContext } from "./flow.ts";

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
  return pickResource(joinedConversations(world), conversationKey, (conversation) => {
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
  if (known.length && rng.chance(0.75))
    return pickResource(known, (row) => row.project.name)!.project.entityId;
  const projects = await mountProjects(world);
  const project = pickResource(projects, (row) => row.name);
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
  if (!projectId) {
    if (config.mode === "coverage") throw new FlowSkipped("No editable project for source task");
    return linkToWork(world, conversationId, message);
  }
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
  return true;
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
  const choice = pickResource(
    picker.rows.filter((row) => !linked.has(row.id)),
    (row) => `${row.kind}:${row.title}`,
  );
  if (!backfill) await (choice ? think("decide") : think("glance"));
  picker.close();
  if (!choice) return;
  if (await linkWork(world, conversationId, message.id, choice)) {
    remember(conversationId, message.id, choice);
    return true;
  }
  return false;
}

/** The linked-work card's remove button on a link this person made. */
async function unlink(world: World) {
  const available = links.filter((link) => {
    const message = world.messages
      .get(link.conversationId)
      ?.find((row) => row.id === link.messageId && !row.deletedAt);
    return message && linkedWorkForMessage(world, message).some((work) => work.id === link.work.id);
  });
  const link = rng.pick(available);
  if (!link) return;
  if (!backfill) {
    await openConversation(world, link.conversationId);
    await think("decide");
  }
  if (await unlinkWork(world, link.conversationId, link.messageId, link.work)) {
    links.splice(links.indexOf(link), 1);
    return true;
  }
  return false;
}

/** Opens linked work from a message: its discussions and, for a task, its history. */
async function readLinked(world: World, message: Message) {
  const work = pickResource(
    linkedWorkForMessage(world, message),
    (row) => `${row.kind}:${row.title}`,
  );
  if (!work) return;
  await think("glance");
  const panel = await showLinkedWork(world, work);
  await readTime(panel.rows + 1, panel.rows * 120);
  panel.close();
  return true;
}

/**
 * Connected work (weight 3; backfill 6): in a conversation, read a message, decide, then create
 * a task from it, link it to existing work, rarely remove a link, or read linked work.
 */
export async function connectedWork({ world }: FlowContext) {
  if (!backfill) await showMessaging(world);
  const conversation = chooseConversation(world);
  if (!conversation) throw new FlowSkipped("No accessible conversation for connected work");
  const messages = await latest(world, conversation.id);
  const message = chooseMessage(world, messages);
  if (!message) throw new FlowSkipped("No message for connected work");
  if (!backfill) {
    await readTime(Math.min(messages.length, 5), 300);
    await readTime(1, message.body.length);
    await think("decide");
  }
  if (config.mode === "coverage") {
    if (!(await createTask(world, conversation.id, message)))
      throw new FlowSkipped("No task created from message");
    if (!(await linkToWork(world, conversation.id, message)))
      throw new FlowSkipped("No message/work link attached");
    await openConversation(world, conversation.id);
    if (!(await readLinked(world, message))) throw new FlowSkipped("No linked card read");
    if (!(await unlink(world))) throw new FlowSkipped("No association detached");
    return;
  }
  const roll = rng.next();
  let performed;
  if (roll < 0.35) performed = await createTask(world, conversation.id, message);
  else if (roll < 0.7) performed = await linkToWork(world, conversation.id, message);
  else if (roll < 0.78 && links.length) performed = await unlink(world);
  else if (backfill) performed = await linkToWork(world, conversation.id, message);
  else performed = await readLinked(world, message);
  if (!performed) throw new FlowSkipped("No connected-work action performed");
}
