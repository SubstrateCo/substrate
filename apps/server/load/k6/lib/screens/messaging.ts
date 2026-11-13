import { cached, currentView, invalidate, mount, navigate, unmount } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys, type QueryKey } from "../keys.ts";
import { applyConversations, applyLatestMessages } from "../world.ts";
import type { ContextRow, Conversation, Message, World } from "../world.ts";
import { mountMessageUnread, mountPeople } from "./frame.ts";
import { hidePictures, showPictures } from "./pictures.ts";

const authors = (rows: Message[]) => rows.map((row) => row.authorImage);

/**
 * The messages screen as the web renders it (components/messaging/...). Each function makes the
 * calls its screen makes on mount, through the cache, so fresh data is not read again and hints
 * refetch what is mounted. Flows call these instead of the endpoints.
 */

type Pane = "timeline" | "thread";

// The context page each pane shows now. A page key changes with its message IDs.
const pageKeys: Partial<Record<Pane, QueryKey>> = {};
// The last read position each pane posted (useConversationRead runs once per message ID).
const readPosted: Partial<Record<Pane, string>> = {};

const showing = (world: World, conversationId: string, threadId?: string) =>
  currentView() === "messages" &&
  world.screen.conversationId === conversationId &&
  (!threadId || world.screen.threadId === threadId);

/**
 * Reads one context page (queries/context/links.ts messagePageOptions): only the IDs this client
 * holds no context for, or all IDs when the page refetches. Like the web, the page holds the rows
 * of all its messages, so hint targets can check which work it links. Resolves null on failure.
 */
export async function readContextPage(
  world: World,
  conversationId: string,
  ids: string[],
  refetch: boolean,
) {
  let known = world.contextIds.get(conversationId);
  if (!known) world.contextIds.set(conversationId, (known = new Map<string, ContextRow | null>()));
  const missing = refetch ? ids : ids.filter((id) => !known.has(id));
  if (missing.length) {
    const rows = await call<ContextRow[]>("context.messagePage", { messageIds: missing });
    if (!rows) return null;
    // A message without a row has no context; it is not requested again either.
    for (const id of missing) known.set(id, null);
    for (const row of rows) known.set(row.messageId, row);
  }
  return ids.flatMap((id) => known.get(id) ?? []);
}

/** Message context for the shown messages. */
async function showContext(world: World, conversationId: string, ids: string[], pane: Pane) {
  const key = keys.messagePage(world.organizationId, conversationId, ids);
  const previous = pageKeys[pane];
  if (previous && previous.join() !== key.join()) unmount(previous);
  pageKeys[pane] = ids.length ? key : undefined;
  if (!ids.length) return;
  await mount(key, (refetch) => readContextPage(world, conversationId, ids, refetch));
}

/** Posts the read position once per shown last message, then refreshes unread counts. */
async function markRead(
  world: World,
  conversationId: string,
  messageId: string | undefined,
  pane: Pane,
) {
  if (!messageId || readPosted[pane] === messageId) return;
  readPosted[pane] = messageId;
  if (!(await call("messaging.read", { conversationId, messageId }))) return;
  await invalidate([keys.messageUnread(world.organizationId)], "mutation");
}

/** The conversation list (messaging-workspace.tsx). Resolves the conversations. */
export async function showMessaging(world: World, selectedConversationId?: string) {
  navigate("messages");
  const org = world.organizationId;
  const key = selectedConversationId
    ? [...keys.conversations(org), "selected", selectedConversationId]
    : keys.conversations(org);
  const [conversations] = await Promise.all([
    mount(key, async () => {
      const rows = await call<Conversation[]>("messaging.conversations", {
        conversationId: selectedConversationId,
      });
      if (rows) applyConversations(world, rows);
      return rows;
    }),
    mountMessageUnread(world),
    mountPeople(world),
    mount(keys.agents(world.userId), () => call("agents.list")),
  ]);
  return conversations ?? world.conversations;
}

export function closeConversation(world: World, conversationId: string) {
  const org = world.organizationId;
  if (world.screen.conversationId === conversationId) {
    closeThread(world);
    world.screen = {};
    pageKeys.timeline = undefined;
    readPosted.timeline = undefined;
    hidePictures("timeline");
  }
  const prefixes = [
    keys.conversationMessages(org, conversationId),
    keys.messagePages(org, conversationId),
    keys.messageTargets(org, conversationId),
    keys.conversationReactions(org, conversationId),
    keys.agentWorkRequests(world.userId, org, conversationId),
    keys.myAgentCalls(world.userId, org, conversationId),
  ];
  for (const prefix of prefixes) unmount(prefix);
  return prefixes;
}

function latestPage(world: World, conversationId: string) {
  return mount(keys.messages(world.organizationId, conversationId, null), async () => {
    const rows = await call<Message[]>("messaging.messages", { conversationId });
    if (!rows) return null;
    applyLatestMessages(world, conversationId, rows);
    // The rendered list loads context for its rows and marks the newest as read, unless the
    // person is looking at older history.
    if (showing(world, conversationId) && !world.screen.olderCursor) {
      await showContext(
        world,
        conversationId,
        rows.map((row) => row.id),
        "timeline",
      );
      if (!showing(world, conversationId)) return rows;
      await markRead(world, conversationId, rows.at(-1)?.id, "timeline");
      // New rows from a refetch show their authors' avatars.
      await showPictures("timeline", conversationId, authors(rows));
    }
    return rows;
  });
}

/**
 * Opens a conversation (conversation-pane.tsx and conversation-agent-work.tsx): the latest page of
 * 50, its message context, the read position, and the agent work strip. Resolves the messages,
 * oldest first, and how many of them this client had not seen.
 */
export async function openConversation(world: World, conversationId: string) {
  const org = world.organizationId;
  const before = new Set((world.messages.get(conversationId) ?? []).map((message) => message.id));
  if (world.screen.conversationId !== conversationId) {
    if (world.screen.conversationId) closeConversation(world, world.screen.conversationId);
    world.screen = { conversationId };
  }
  const [rows] = await Promise.all([
    latestPage(world, conversationId),
    mount(keys.agentWorkRequests(world.userId, org, conversationId), () =>
      call("agentWork.requests", { conversationId }),
    ),
    mount(keys.agentWorkStatus(world.userId, org), () => call("agentWork.status")),
    mount(keys.myAgentCalls(world.userId, org, conversationId), () =>
      call("agentWork.callsMine", { conversationId }),
    ),
  ]);
  // A cached page shows without a read; its effects still run once for this pane.
  const messages = rows ?? [];
  if (!showing(world, conversationId)) return { messages, unseen: 0 };
  await showContext(
    world,
    conversationId,
    messages.map((row) => row.id),
    "timeline",
  );
  if (!showing(world, conversationId)) return { messages, unseen: 0 };
  await markRead(world, conversationId, messages.at(-1)?.id, "timeline");
  await showPictures("timeline", conversationId, authors(messages));
  return { messages, unseen: messages.filter((message) => !before.has(message.id)).length };
}

/** Scrolls up one page in the open conversation. Resolves the older page, oldest first. */
export async function loadOlder(world: World) {
  const { conversationId, olderCursor } = world.screen;
  if (!conversationId) return [];
  const org = world.organizationId;
  const page = (cursor: string) => keys.messages(org, conversationId, null, `before:${cursor}`);
  const shown = olderCursor
    ? (cached<Message[]>(page(olderCursor)) ?? [])
    : (world.messages.get(conversationId) ?? []);
  const first = shown[0]?.id;
  // A page shorter than 50 is the start of the conversation.
  if (!first || shown.length < 50) return [];
  if (olderCursor) unmount(page(olderCursor));
  world.screen.olderCursor = first;
  const rows =
    (await mount(page(first), () =>
      call<Message[]>("messaging.messages", { conversationId, beforeMessageId: first }),
    )) ?? [];
  await showContext(
    world,
    conversationId,
    rows.map((row) => row.id),
    "timeline",
  );
  await showPictures("timeline", conversationId, authors(rows));
  return rows;
}

/** "Jump to latest" after reading history: the latest page is stale and reads again. */
export async function jumpToLatest(world: World) {
  const { conversationId, olderCursor } = world.screen;
  if (!conversationId || !olderCursor) return;
  const org = world.organizationId;
  unmount(keys.messages(org, conversationId, null, `before:${olderCursor}`));
  world.screen.olderCursor = undefined;
  await invalidate([keys.messages(org, conversationId, null)], "mutation");
  await openConversation(world, conversationId);
}

/**
 * Opens a thread (thread-pane.tsx): the message target, the replies, their context, and the read
 * position. Resolves the replies without the root, oldest first.
 */
export async function openThread(world: World, rootId: string) {
  const { conversationId } = world.screen;
  if (!conversationId) return [];
  const org = world.organizationId;
  if (world.screen.threadId !== rootId) closeThread(world);
  world.screen.threadId = rootId;
  await mount(keys.messageTarget(org, conversationId, rootId), () =>
    call("context.messageTarget", { conversationId, messageId: rootId }),
  );
  const rows =
    (await mount(keys.messages(org, conversationId, rootId), async () => {
      const page = await call<Message[]>("messaging.messages", {
        conversationId,
        threadId: rootId,
      });
      if (page && showing(world, conversationId, rootId)) {
        const replies = page.filter((message) => message.id !== rootId);
        await showContext(
          world,
          conversationId,
          replies.map((row) => row.id),
          "thread",
        );
        if (showing(world, conversationId, rootId))
          await markRead(world, conversationId, page.at(-1)?.id, "thread");
      }
      return page;
    })) ?? [];
  const replies = rows.filter((message) => message.id !== rootId);
  if (!showing(world, conversationId, rootId)) return replies;
  await showContext(
    world,
    conversationId,
    replies.map((row) => row.id),
    "thread",
  );
  if (!showing(world, conversationId, rootId)) return replies;
  await markRead(world, conversationId, rows.at(-1)?.id, "thread");
  await showPictures("thread", rootId, authors(rows));
  return replies;
}

export function closeThread(world: World) {
  const { conversationId, threadId } = world.screen;
  if (!conversationId || !threadId) return;
  const org = world.organizationId;
  unmount(keys.messageTarget(org, conversationId, threadId));
  unmount(keys.messages(org, conversationId, threadId));
  if (pageKeys.thread) unmount(pageKeys.thread);
  pageKeys.thread = undefined;
  readPosted.thread = undefined;
  world.screen.threadId = undefined;
  hidePictures("thread");
}

/**
 * Hovers a reaction chip (reaction-preview.tsx, 3 names), or opens the full list
 * (reaction-list.tsx, then pages of 25). The popover closes afterwards.
 */
export async function showReactions(world: World, message: Message, emoji: string, full = false) {
  const key = keys.messageReactions(
    world.organizationId,
    message.conversationId,
    message.id,
    emoji,
  );
  const first = await mount(key, () =>
    call<{ nextCursor?: string }>("messaging.reactions", {
      messageId: message.id,
      emoji,
      limit: 3,
    }),
  );
  if (full && first?.nextCursor)
    await call("messaging.reactions", {
      messageId: message.id,
      emoji,
      afterActorId: first.nextCursor,
      limit: 25,
    });
  unmount(key);
}

/** Hovers a person's name (person-hover-card.tsx). Profiles stay fresh for 60 s. */
export async function hoverProfile(world: World, conversationId: string, actorId: string) {
  const key = keys.messagingProfile(world.organizationId, conversationId, actorId);
  await mount(key, () => call("messaging.profiles", { conversationId, actorId }), {
    staleTime: 60_000,
  });
  unmount(key);
}

/**
 * The mention picker after typing "@" and `query` (reference-picker.tsx): one search per kind,
 * 5 results each. Resolves the rows; each `id` goes in a `@[kind:id]` token.
 */
export async function mentionSearch(world: World, conversationId: string, query: string) {
  const kinds = ["person", "agent", "task", "project"] as const;
  const results = await Promise.all(
    kinds.map(async (kind) => {
      const input = { conversationId, query, kind, limit: 5 };
      const key = [...keys.search(world.organizationId), JSON.stringify(input)];
      const rows = await mount(key, () =>
        call<{ id: string; title: string }[]>("context.search", input),
      );
      unmount(key);
      return (rows ?? []).slice(0, 5).map((row) => ({ ...row, kind }));
    }),
  );
  return results.flat();
}

const tokenPattern = /@\[(task|project|person|agent|channel|thread):([0-9a-f-]{36})\]/gi;

/**
 * Sends a message and invalidates what the composer invalidates (invalidateSentMessage).
 * Resolves the created message, or null.
 */
export async function sendMessage(
  world: World,
  conversationId: string,
  body: string,
  threadId?: string,
) {
  const org = world.organizationId;
  const message = await call<Message>("messaging.messages.send", {
    conversationId,
    threadId,
    body,
    requestId: crypto.randomUUID(),
  });
  if (!message) return null;
  const referenced = [...body.matchAll(tokenPattern)].map((match) => keys.related(org, match[2]!));
  await invalidate(
    [
      keys.conversationMessages(org, conversationId),
      keys.messageTargets(org, conversationId),
      ...referenced,
      ...[keys.search(org), keys.searchPages(org)].map((prefix) => ({
        prefix,
        staleOnly: true as const,
      })),
    ],
    "mutation",
  );
  return message;
}

/** Toggles a reaction and invalidates as useToggleReaction does. */
export async function toggleReaction(world: World, message: Message, emoji: string) {
  const org = world.organizationId;
  const result = await call("messaging.reactions.toggle", { messageId: message.id, emoji });
  if (!result) return false;
  await invalidate(
    [
      keys.conversationMessages(org, message.conversationId),
      keys.messageTargets(org, message.conversationId),
      keys.messageReactions(org, message.conversationId, message.id),
    ],
    "mutation",
  );
  return true;
}

/** Edits the user's own message. Like the web, it then refreshes all messaging and context. */
export async function editMessage(world: World, message: Message, body: string) {
  const result = await call("messaging.messages.edit", { messageId: message.id, body });
  if (result)
    await invalidate(
      [keys.messaging(world.organizationId), keys.context(world.organizationId)],
      "mutation",
    );
  return !!result;
}

/** Deletes the user's own message, with the same refresh as an edit. */
export async function deleteMessage(world: World, message: Message) {
  const result = await call("messaging.messages.delete", { messageId: message.id });
  if (!result) return false;
  const page = world.messages.get(message.conversationId) ?? [];
  world.messages.set(
    message.conversationId,
    page.filter((row) => row.id !== message.id),
  );
  await invalidate(
    [keys.messaging(world.organizationId), keys.context(world.organizationId)],
    "mutation",
  );
  return true;
}
