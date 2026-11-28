import { inFlightReads } from "@substrate/contracts/in-flight";

import type { InfiniteData, Query, QueryClient } from "@tanstack/react-query";

import type { getMessageTarget } from "../api/context";
import type { listMessages } from "../api/messages";
import { messagingKeys } from "../keys";
import { messagePageSize } from "../messages/pagination";
import type { Message, MessagingConversationTarget } from "../types";
import type { QueryScope } from "@/queries/keys";

type History = InfiniteData<Message[], string | undefined>;

export const latestHistoryKey = (
  scope: QueryScope,
  { conversationId, threadId }: MessagingConversationTarget,
) => [...messagingKeys.messages(scope, conversationId, threadId), null] as const;

const reads = inFlightReads<QueryClient, boolean>();

function latestHistory(
  client: QueryClient,
  scope: QueryScope,
  location: MessagingConversationTarget,
) {
  return client
    .getQueryCache()
    .find<History>({ queryKey: latestHistoryKey(scope, location), exact: true });
}

export function canAppendNewMessages(
  client: QueryClient,
  scope: QueryScope,
  location: MessagingConversationTarget,
) {
  const query = latestHistory(client, scope, location);
  return (
    !!query &&
    query.state.status === "success" &&
    query.state.fetchStatus === "idle" &&
    !query.state.isInvalidated &&
    !!query.state.data?.pages[0]?.length
  );
}

export async function appendNewMessages(
  client: QueryClient,
  scope: QueryScope,
  location: MessagingConversationTarget,
  {
    messageId,
    load,
    shouldApply = () => true,
  }: {
    messageId?: string;
    load: typeof listMessages;
    shouldApply?: () => boolean;
  },
): Promise<boolean> {
  const query = latestHistory(client, scope, location);
  if (!query) return false;
  const has = () =>
    !!messageId && !!query.state.data?.pages[0]?.some((row) => row.id === messageId);
  const running = reads.running(client, query.queryHash);
  if (running) await running;
  if (has()) return true;
  if (
    !canAppendNewMessages(client, scope, location) ||
    client.getQueryCache().get(query.queryHash) !== query
  )
    return false;
  const after = query.state.data!.pages[0]!.at(-1)!.id;
  const read = (async () => {
    let newer: Message[];
    try {
      newer = await load({
        organizationId: scope.organizationId,
        ...location,
        afterMessageId: after,
      });
    } catch {
      return false;
    }
    if (newer.length >= messagePageSize || !shouldApply()) return false;
    const current = query.state.data;
    const newest = current?.pages[0];
    if (!current || !newest || client.getQueryCache().get(query.queryHash) !== query) return false;
    const older = current.pages.slice(1);
    const known = new Set(newest.map((row) => row.id));
    const added = newer.filter((row) => !known.has(row.id));
    if (added.length)
      client.setQueryData<History>(query.queryKey, {
        ...current,
        pages: [[...newest, ...added], ...older],
      });
    return true;
  })();
  return reads.track(client, query.queryHash, read);
}

function rootHistories(
  client: QueryClient,
  scope: QueryScope,
  { conversationId, threadId }: MessagingConversationTarget,
  unloaded = false,
): Query[] {
  return client
    .getQueryCache()
    .findAll({ queryKey: messagingKeys.messages(scope, conversationId) })
    .filter(({ state: { data } }) =>
      data === undefined
        ? unloaded
        : // SAFETY: timeline history keys cache infinite message pages.
          (data as History).pages.some((page) => page.some((row) => row.id === threadId)),
    );
}

export function replyCountUpdate(
  client: QueryClient,
  scope: QueryScope,
  location: MessagingConversationTarget,
) {
  const histories = rootHistories(client, scope, location, true);
  if (!histories.length) return "none";
  const settled = histories.every(
    (query) => query.state.fetchStatus === "idle" && !query.state.isInvalidated,
  );
  return settled ? "root" : "full";
}

export async function refreshReplyCount(
  client: QueryClient,
  scope: QueryScope,
  location: MessagingConversationTarget,
  {
    load,
    shouldApply = () => true,
  }: { load: typeof getMessageTarget; shouldApply?: () => boolean },
): Promise<boolean> {
  const { conversationId, threadId } = location;
  if (!threadId) return false;
  let count: number;
  try {
    const target = await load({
      organizationId: scope.organizationId,
      conversationId,
      messageId: threadId,
    });
    count = target.root.replyCount;
  } catch {
    return false;
  }
  if (!shouldApply()) return false;
  const raise = (row: Message) =>
    row.id === threadId && row.replyCount < count ? { ...row, replyCount: count } : row;
  for (const query of rootHistories(client, scope, location))
    client.setQueryData<History>(
      query.queryKey,
      (history) => history && { ...history, pages: history.pages.map((page) => page.map(raise)) },
    );
  return true;
}
