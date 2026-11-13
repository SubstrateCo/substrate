import { config } from "../lib/config.ts";
import { call } from "../lib/http.ts";
import { readTime, think, typeTime } from "../lib/pacing.ts";
import { pickResource, rng } from "../lib/persona.ts";
import {
  closeThread,
  deleteMessage,
  editMessage,
  mentionSearch,
  openConversation,
  openThread,
  sendMessage,
  showMessaging,
  toggleReaction,
} from "../lib/screens/messaging.ts";
import { word, messageBody } from "../lib/words.ts";
import {
  applyLatestMessages,
  conversationKey,
  joinedConversations,
  type Conversation,
  type Message,
  type World,
} from "../lib/world.ts";
import { FlowSkipped, type FlowContext } from "./flow.ts";

const backfill = config.mode === "backfill";
const emojis = ["👍", "🎉", "❤️", "😂", "👀", "✅", "🙏", "🔥", "💯", "🚀"];
const minute = 60_000;

/**
 * References this VU found through the mention picker, reused like recent picks. People and
 * agents are mentionable only where they can see the conversation, so they stay with theirs.
 */
const known: { kind: string; id: string; conversationId: string }[] = [];

/**
 * Backfill skew: rank conversations by a shared hash and weight them Zipf-like, so a few channels
 * collect thousands of messages and most stay short.
 */
function backfillTarget(world: World) {
  return pickResource(
    joinedConversations(world).filter((conversation) => conversation.canPost),
    conversationKey,
  );
}

/** Mostly the open conversation; otherwise an active one, with direct messages favored. */
function liveTarget(world: World) {
  const writable = joinedConversations(world).filter((conversation) => conversation.canPost);
  const open = writable.find((c) => c.id === world.screen.conversationId);
  if (open && rng.chance(0.6)) return open;
  const now = Date.now();
  return pickResource(writable, conversationKey, (conversation) => {
    const idle = now - (world.activity.get(conversation.id) ?? 0);
    const kind = conversation.kind === "channel" ? 1 : 1.6;
    let recency = 1;
    if (idle < 10 * minute) recency = 4;
    else if (idle < 60 * minute) recency = 2;
    return kind * recency;
  });
}

/** Backfill reads the latest page only when it has none, or now and then for new targets. */
async function recentMessages(world: World, conversationId: string) {
  if (!backfill) return (await openConversation(world, conversationId)).messages;
  const cached = world.messages.get(conversationId);
  if (cached && !rng.chance(0.1)) return cached;
  const rows = await call<Message[]>("messaging.messages", { conversationId });
  if (rows) applyLatestMessages(world, conversationId, rows);
  return rows ?? cached ?? [];
}

/** Types "@" and part of a name or title; the picker searches; the person picks a result. */
async function mention(world: World, conversation: Conversation) {
  const usable = known.filter(
    (reference) =>
      (reference.kind === "task" && world.tasks.some((task) => task.entityId === reference.id)) ||
      (reference.kind === "project" &&
        world.projects.some((project) => project.entityId === reference.id)) ||
      ((reference.kind === "person" || reference.kind === "agent") &&
        reference.conversationId === conversation.id &&
        conversation.members.some((member) => member.actorId === reference.id)),
  );
  if (usable.length && (backfill ? rng.chance(0.8) : rng.chance(0.3))) {
    const reference = rng.pick(usable)!;
    return `@[${reference.kind}:${reference.id}]`;
  }
  const people = conversation.members.filter(
    (member) => member.type === "human" && member.userId !== world.userId,
  );
  const person = rng.chance(0.6) ? rng.pick(people) : undefined;
  const work = rng.pick([...world.tasks, ...world.projects]);
  const text = person?.name ?? work?.title ?? word();
  const query = text.slice(0, rng.int(2, Math.min(5, text.length)));
  await typeTime(`@${query}`);
  const results = await mentionSearch(world, conversation.id, query);
  let wanted: "person" | "task" | "project" | undefined;
  if (person) wanted = "person";
  else if (work) wanted = work.projectEntityId ? "task" : "project";
  const choice =
    results.find((row) => row.kind === wanted) ??
    rng.pick(results.filter((row) => row.kind !== "agent"));
  if (!choice) return "";
  await think("glance");
  if (!known.some((ref) => ref.id === choice.id && ref.conversationId === conversation.id))
    known.push({ kind: choice.kind, id: choice.id, conversationId: conversation.id });
  if (known.length > 40) known.shift();
  return `@[${choice.kind}:${choice.id}]`;
}

/** Composes and sends one message: think, type, sometimes mention someone or some work. */
async function compose(world: World, conversation: Conversation, threadId?: string) {
  let body = messageBody();
  await think(body.length > 200 ? "composeLong" : "composeShort");
  if (rng.chance(0.12)) {
    const words = body.split(" ");
    const at = rng.int(0, Math.min(words.length, 6));
    await typeTime(words.slice(0, at).join(" "));
    const token = await mention(world, conversation);
    await typeTime(words.slice(at).join(" "));
    body = [...words.slice(0, at), token, ...words.slice(at)].filter(Boolean).join(" ");
  } else await typeTime(body);
  const message = await sendMessage(world, conversation.id, body, threadId);
  if (message && backfill && !threadId)
    world.messages.set(conversation.id, [
      ...(world.messages.get(conversation.id) ?? []).slice(-49),
      message,
    ]);
  return message;
}

async function replyInThread(world: World, conversation: Conversation, messages: Message[]) {
  const roots = messages.slice(-15).filter((message) => !message.deletedAt);
  // Recent messages and live threads draw replies.
  const root = rng.weighted(
    roots,
    (message) => (roots.indexOf(message) + 1) * (1 + message.replyCount),
  );
  if (!root) return compose(world, conversation);
  if (!backfill) {
    const replies = await openThread(world, root.id);
    await readTime(replies.length + 1, root.body.length);
  }
  const message = await compose(world, conversation, root.id);
  if (!backfill && rng.chance(0.5)) closeThread(world);
  return message;
}

async function react(world: World, messages: Message[]) {
  const others = messages
    .slice(-12)
    .filter((message) => message.authorActorEntityId !== world.actorId && !message.deletedAt);
  const message = rng.pick(others);
  if (!message) return;
  await think("decide");
  // Popular emoji win most of the time, and existing reactions get joined.
  const existing = message.reactions.find((reaction) => !reaction.reacted && rng.chance(0.5));
  const emoji = existing?.emoji ?? rng.weighted(emojis, (e) => 1 / (emojis.indexOf(e) + 1))!;
  return toggleReaction(world, message, emoji);
}

async function reviseOwn(world: World, messages: Message[]) {
  const own = messages.slice(-10).filter((message) => message.canModify && !message.deletedAt);
  const message = rng.pick(own);
  if (!message) return;
  await think("decide");
  if (rng.chance(0.65)) {
    const addition = ` ${word()} ${word()}`;
    await typeTime(addition);
    return editMessage(world, message, `${message.body}${addition}`);
  } else return deleteMessage(world, message);
}

/**
 * Writing messages (weight 20; backfill 60): be in a conversation, then send one to three
 * messages with pauses between them. Some are thread replies or reactions, a few mention a
 * person or work found through the mention picker, and rarely the user edits or deletes their
 * own recent message.
 */
export async function writeMessages({ world }: FlowContext) {
  if (!backfill) await showMessaging(world);
  const conversation = backfill ? backfillTarget(world) : liveTarget(world);
  if (!conversation) throw new FlowSkipped("No writable conversation");
  const opened = world.screen.conversationId === conversation.id;
  const messages = await recentMessages(world, conversation.id);
  if (!backfill && !opened) await readTime(Math.min(messages.length, 5), 300);
  if (config.mode === "coverage") {
    const sent = await compose(world, conversation);
    if (!sent) throw new FlowSkipped("Coverage message not sent");
    if (!(await replyInThread(world, conversation, [sent])))
      throw new FlowSkipped("Coverage reply not sent");
    return;
  }
  const actions = rng.weighted([1, 2, 3], (count) => [55, 30, 15][count - 1]!)!;
  let performed = false;
  for (let action = 0; action < actions; action++) {
    const roll = rng.next();
    let result;
    if (roll < 0.15) result = await react(world, messages);
    else if (roll < 0.35) result = await replyInThread(world, conversation, messages);
    else if (roll < 0.38)
      result = await reviseOwn(world, world.messages.get(conversation.id) ?? messages);
    else result = await compose(world, conversation);
    performed = !!result || performed;
    if (action < actions - 1) await think("between");
  }
  if (!performed) throw new FlowSkipped("No message action performed");
}
