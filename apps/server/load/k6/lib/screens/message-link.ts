import { invalidate, mount, unmount } from "../client-cache.ts";
import { call } from "../http.ts";
import { keys } from "../keys.ts";
import { applyLatestMessages, type Message, type World } from "../world.ts";
import { closeThread, readContextPage, showMessaging } from "./messaging.ts";

/** Search and notification links resolve the root, then show the target in its history pane. */
export async function openMessageLink(world: World, conversationId: string, messageId: string) {
  await showMessaging(world);
  const org = world.organizationId;
  closeThread(world);
  const old = world.screen.conversationId;
  if (old) {
    for (const prefix of [
      keys.conversationMessages(org, old),
      keys.messagePages(org, old),
      keys.messageTargets(org, old),
      keys.agentWorkRequests(world.userId, org, old),
      keys.myAgentCalls(world.userId, org, old),
    ])
      unmount(prefix);
  }
  world.screen = { conversationId };
  const [target, latest] = await Promise.all([
    mount(keys.messageTarget(org, conversationId, messageId), () =>
      call<{ root: Message; message: Message }>("context.messageTarget", {
        conversationId,
        messageId,
      }),
    ),
    mount(keys.messages(org, conversationId, null), async () => {
      const rows = await call<Message[]>("messaging.messages", { conversationId });
      if (rows) applyLatestMessages(world, conversationId, rows);
      return rows;
    }),
    mount(keys.agentWorkRequests(world.userId, org, conversationId), () =>
      call("agentWork.requests", { conversationId }),
    ),
    mount(keys.agentWorkStatus(world.userId, org), () => call("agentWork.status")),
    mount(keys.myAgentCalls(world.userId, org, conversationId), () =>
      call("agentWork.callsMine", { conversationId }),
    ),
  ]);
  if (!target) return [];
  const timeline = latest?.some((row) => row.id === target.root.id)
    ? latest
    : await around(world, conversationId, target.root.id);
  await contextPage(world, conversationId, timeline);
  if (timeline.at(-1)?.id !== latest?.at(-1)?.id) world.screen.olderCursor = timeline[0]?.id;
  else await markRead(world, conversationId, timeline.at(-1)?.id);

  const threadId = target.root.id;
  world.screen.threadId = threadId;
  const latestReplies =
    (await mount(keys.messages(org, conversationId, threadId), () =>
      call<Message[]>("messaging.messages", { conversationId, threadId }),
    )) ?? [];
  // A reply link mounts both its centered page and latest; a root link shows latest replies.
  const replies = target.message.threadId
    ? await around(world, conversationId, messageId, threadId)
    : latestReplies;
  await contextPage(
    world,
    conversationId,
    replies.filter((row) => row.id !== threadId),
  );
  if (replies.at(-1)?.id === latestReplies.at(-1)?.id)
    await markRead(world, conversationId, replies.at(-1)?.id);
  return [target.root, ...replies.filter((row) => row.id !== threadId)];
}

async function around(world: World, conversationId: string, messageId: string, threadId?: string) {
  const org = world.organizationId;
  // The latest query remains mounted as well, just as useMessageHistory does.
  const rows =
    (await mount(keys.messages(org, conversationId, threadId ?? null, `around:${messageId}`), () =>
      call<Message[]>("messaging.messages", {
        conversationId,
        threadId,
        aroundMessageId: messageId,
      }),
    )) ?? [];
  return rows;
}

async function contextPage(world: World, conversationId: string, rows: Message[]) {
  if (!rows.length) return;
  const ids = rows.map((row) => row.id);
  await mount(keys.messagePage(world.organizationId, conversationId, ids), (refetch) =>
    readContextPage(world, conversationId, ids, refetch),
  );
}

async function markRead(world: World, conversationId: string, messageId?: string) {
  if (messageId && (await call("messaging.read", { conversationId, messageId })))
    await invalidate([keys.messageUnread(world.organizationId)], "mutation");
}
