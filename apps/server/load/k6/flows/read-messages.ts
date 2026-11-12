import { currentView } from "../lib/client-cache.ts";
import { readTime, think } from "../lib/pacing.ts";
import { persona, rng } from "../lib/persona.ts";
import { openMessageAttachment } from "../lib/screens/files.ts";
import {
  closeThread,
  hoverProfile,
  jumpToLatest,
  loadOlder,
  openConversation,
  openThread,
  showMessaging,
  showReactions,
} from "../lib/screens/messaging.ts";
import { joinedConversations, type Conversation, type Message, type World } from "../lib/world.ts";
import type { FlowContext } from "./flow.ts";

const minute = 60_000;

/** Unread first, then recently active; the open conversation rarely. */
function chooseConversation(world: World): Conversation | undefined {
  const now = Date.now();
  return rng.weighted(joinedConversations(world), (conversation) => {
    if (conversation.id === world.screen.conversationId) return 0.3;
    const unread = world.unread.get(conversation.id) ?? 0;
    const idle = now - (world.activity.get(conversation.id) ?? 0);
    let weight = 0.6;
    if (unread > 0) weight += 6 + Math.min(unread, 20) * 0.5;
    if (idle < 10 * minute) weight += 3;
    else if (idle < 60 * minute) weight += 1.5;
    return weight;
  });
}

const chars = (messages: Message[]) =>
  messages.reduce((sum, message) => sum + message.body.length, 0);

async function scrollHistory(world: World) {
  const pages = rng.weighted([1, 2, 3], (count) => [6, 3, 1][count - 1]!)!;
  for (let page = 0; page < pages; page++) {
    const older = await loadOlder(world);
    if (!older.length) break;
    // Skimming history is faster than reading new messages.
    await readTime(Math.ceil(older.length / 3), chars(older) / 3);
  }
  if (rng.chance(0.6)) {
    await think("glance");
    await jumpToLatest(world);
  }
}

/** Now and then a shown file looks worth opening. */
async function maybeOpenFile(world: World, messages: Message[]) {
  const message = rng.pick(messages.filter((row) => row.attachments?.length && !row.deletedAt));
  if (!message || !rng.chance(0.05)) return;
  await think("glance");
  await openMessageAttachment(world, message, rng.pick(message.attachments)!.id);
  await think("read");
}

async function readThread(world: World, messages: Message[]) {
  const roots = messages.slice(-20).filter((message) => !message.deletedAt);
  const root = rng.weighted(roots, (message) =>
    message.replyCount > 0 ? 4 + message.replyCount : 0.4,
  );
  if (!root) return;
  await think("glance");
  const replies = await openThread(world, root.id);
  await readTime(replies.length + 1, chars(replies) + root.body.length);
  await maybeOpenFile(world, replies);
  if (rng.chance(0.7)) closeThread(world);
}

async function glanceAtPeople(world: World, conversation: Conversation, messages: Message[]) {
  const others = messages.filter((message) => message.authorActorEntityId !== world.actorId);
  const author = rng.pick(others.slice(-15));
  if (!author) return;
  await hoverProfile(world, conversation.id, author.authorActorEntityId);
  await think("glance");
}

async function glanceAtReactions(messages: Message[], world: World) {
  const reacted = messages.slice(-25).filter((message) => message.reactions.length > 0);
  const message = rng.pick(reacted);
  const reaction = message && rng.pick(message.reactions);
  if (!message || !reaction) return;
  await showReactions(world, message, reaction.emoji, rng.chance(0.15));
  await think("glance");
}

/**
 * Reading messages (weight 35): open the list, visit one to three conversations with a preference
 * for unread and active ones, read for as long as the new content needs, and sometimes scroll
 * history, open a thread, hover a person or look at who reacted.
 */
export async function readMessages({ world }: FlowContext) {
  const arriving = currentView() !== "messages";
  await showMessaging(world);
  await think(arriving ? "navigate" : "glance");
  const visits = rng.weighted([1, 2, 3], (count) => [5, 3, 1.5 * persona.activity][count - 1]!)!;
  for (let visit = 0; visit < visits; visit++) {
    const conversation = chooseConversation(world);
    if (!conversation) return;
    const unread = world.unread.get(conversation.id) ?? 0;
    const { messages, unseen } = await openConversation(world, conversation.id);
    const fresh = messages.slice(-Math.min(messages.length, Math.max(unread, unseen)));
    // Nothing new: a short look at the latest few.
    if (fresh.length) await readTime(fresh.length, chars(fresh));
    else await readTime(Math.min(messages.length, 3), chars(messages.slice(-3)));
    await maybeOpenFile(world, messages.slice(-15));

    if (rng.chance(0.2)) await glanceAtPeople(world, conversation, messages);
    if (rng.chance(0.15)) await glanceAtReactions(messages, world);
    if (messages.length >= 50 && rng.chance(0.15)) await scrollHistory(world);
    if (rng.chance(0.25)) await readThread(world, messages);
    if (visit < visits - 1) await think("navigate");
  }
}
