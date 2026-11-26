import { inFlightReads } from "@substrate/contracts/in-flight";

import type { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { messagesQueryOptions } from "./options";
import { loadMessageTarget } from "@/api/context/message-targets";
import { listMessages, type Message } from "@/api/messaging/requests";

/**
 * The server's page size. A full page is the only sign that older messages may exist, and a
 * full page of newer messages may leave a gap before it.
 */
export const historyPageSize = 50;

/** One timeline or thread. Without a thread, the conversation's main timeline. */
export interface MessageLocation {
  organizationId: string;
  conversationId: string;
  threadId?: string;
}

const reads = inFlightReads<QueryClient, boolean>();

function latestPage(client: QueryClient, location: MessageLocation) {
  const { queryKey } = messagesQueryOptions(
    location.organizationId,
    location.conversationId,
    location.threadId,
  );
  return client.getQueryCache().find<Message[]>({ queryKey, exact: true });
}

/**
 * Whether new messages can be added to the cached latest page without reading all of it: it
 * loaded, nothing reads or invalidated it, and it has a newest message to read after.
 */
export function canAppendNewMessages(client: QueryClient, location: MessageLocation) {
  const query = latestPage(client, location);
  return (
    !!query &&
    query.state.status === "success" &&
    query.state.fetchStatus === "idle" &&
    !query.state.isInvalidated &&
    !!query.state.data?.length
  );
}

// Timeline pages that show this thread's root, and with `unloaded`, pages that may show it.
function rootPages(
  client: QueryClient,
  { organizationId, conversationId, threadId }: MessageLocation,
  unloaded = false,
) {
  return client
    .getQueryCache()
    .findAll({ queryKey: queryKeys.messages(organizationId, conversationId) })
    .filter(({ state: { data } }) =>
      Array.isArray(data)
        ? // SAFETY: timeline history pages cache message rows.
          (data as Message[]).some((row) => row.id === threadId)
        : unloaded && data === undefined,
    );
}

/**
 * How a new reply reaches the timeline: "none" when no page shows its root, "root" when reading
 * the root alone can update its reply count, and "full" when a page that may show the root is
 * being read or is already stale: that read may predate the reply, so only a full read after it
 * keeps the page in order.
 */
export function replyCountUpdate(client: QueryClient, location: MessageLocation) {
  const pages = rootPages(client, location, true);
  if (!pages.length) return "none";
  const settled = pages.every(
    (query) => query.state.fetchStatus === "idle" && !query.state.isInvalidated,
  );
  return settled ? "root" : "full";
}

/**
 * Reads a thread's root alone and raises its reply count in the timeline pages that show it.
 * New replies only add to the count, so the higher count wins: a late or repeated read cannot
 * lower it. Deleting a reply sends a different hint, which reads the timeline in full. Resolves
 * whether the pages are current.
 */
export async function refreshReplyCount(
  client: QueryClient,
  location: MessageLocation,
  {
    load = loadMessageTarget,
    shouldApply = () => true,
  }: { load?: typeof loadMessageTarget; shouldApply?: () => boolean } = {},
): Promise<boolean> {
  const { organizationId, conversationId, threadId } = location;
  if (!threadId) return false;
  let count: number;
  try {
    count = (await load(organizationId, conversationId, threadId)).root.replyCount;
  } catch {
    return false;
  }
  if (!shouldApply()) return false;
  for (const query of rootPages(client, location))
    client.setQueryData<Message[]>(query.queryKey, (rows) =>
      rows?.map((row) =>
        row.id === threadId && row.replyCount < count ? { ...row, replyCount: count } : row,
      ),
    );
  return true;
}

/**
 * Reads only the messages after the latest page's newest one and appends them. Resolves whether
 * the page is current; when it is not, only a full read can bring it up to date. Reads for one
 * page share one request.
 */
export async function appendNewMessages(
  client: QueryClient,
  location: MessageLocation,
  {
    messageId,
    load = listMessages,
    shouldApply = () => true,
  }: {
    /** The new message. When the page already has it, nothing is read. */
    messageId?: string;
    load?: typeof listMessages;
    shouldApply?: () => boolean;
  } = {},
): Promise<boolean> {
  const query = latestPage(client, location);
  if (!query) return false;
  const has = () => !!messageId && !!query.state.data?.some((row) => row.id === messageId);
  const running = reads.running(client, query.queryHash);
  if (running) await running;
  if (has()) return true;
  if (
    !canAppendNewMessages(client, location) ||
    client.getQueryCache().get(query.queryHash) !== query
  )
    return false;
  const after = query.state.data!.at(-1)!.id;
  const read = (async () => {
    let newer: Message[];
    try {
      newer = await load({ data: { ...location, afterMessageId: after } });
    } catch {
      return false;
    }
    if (newer.length >= historyPageSize || !shouldApply()) return false;
    // A full read that started meanwhile replaced the page. It began after the change, so
    // appending keeps it whole: rows it has are skipped, and the others are newer than its last.
    const current = query.state.data;
    if (!current || client.getQueryCache().get(query.queryHash) !== query) return false;
    const known = new Set(current.map((row) => row.id));
    const added = newer.filter((row) => !known.has(row.id));
    if (added.length)
      client.setQueryData(query.queryKey, [...current, ...added].slice(-historyPageSize));
    return true;
  })();
  return reads.track(client, query.queryHash, read);
}
