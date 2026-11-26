import type { RealtimeEvent } from "@substrate/contracts/realtime";

import { QueryClient, QueryObserver, type InfiniteData } from "@tanstack/react-query";

import { createRealtimeCache } from "./cache";
import type { RealtimeChange } from "./targets";
import type { getMessageTarget } from "@/features/messaging/api/context";
import type { listMessages } from "@/features/messaging/api/messages";
import { messagingKeys } from "@/features/messaging/keys";
import { latestHistoryKey } from "@/features/messaging/queries/new-messages";
import type { Message } from "@/features/messaging/types";
import { afterEach, expect, test } from "bun:test";

const scope = { userId: "user-1", organizationId: "org-1" };
type Row = Pick<Message, "id" | "replyCount">;
// SAFETY: the cache reads only message IDs and reply counts.
const rows = (items: Row[]) => items as Message[];
const row = (id: string, replyCount = 0): Row => ({ id, replyCount });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

let client: QueryClient;
afterEach(() => client.clear());

function setup({
  newer = (): Row[] => [],
  rootReplies = 0,
}: { newer?: () => Row[]; rootReplies?: number } = {}) {
  client = new QueryClient();
  const afterReads: (string | undefined)[] = [];
  const loadMessages: typeof listMessages = async (query) => {
    afterReads.push(query.afterMessageId);
    return rows(newer());
  };
  const loadTarget: typeof getMessageTarget = async () =>
    // SAFETY: the cache reads only the root's reply count.
    ({ root: rows([row("root", rootReplies)])[0]! }) as Awaited<
      ReturnType<typeof getMessageTarget>
    >;
  const cache = createRealtimeCache({
    queryClient: client,
    ...scope,
    batchMs: 0,
    loadMessages,
    loadTarget,
  });
  return { cache, afterReads };
}

function change(detail: Partial<RealtimeChange>): RealtimeChange {
  const event: RealtimeEvent = {
    version: 1,
    type: "change",
    id: crypto.randomUUID(),
    organizationId: scope.organizationId,
    domain: "messaging",
    ...detail,
  };
  // SAFETY: the event literal above has type "change".
  return event as RealtimeChange;
}

const timeline = latestHistoryKey(scope, { conversationId: "c1" });
const history = (pages: Row[][]): InfiniteData<Row[], string | undefined> => ({
  pages,
  pageParams: pages.map((_, index) => (index ? pages[index - 1]![0]!.id : undefined)),
});
const newestPage = () =>
  client.getQueryData<InfiniteData<Row[]>>(timeline)?.pages[0]?.map((item) => item.id);
const invalidated = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;

test("a new message reads only the messages after the newest loaded one", async () => {
  const { cache, afterReads } = setup({ newer: () => [row("m3")] });
  client.setQueryData(timeline, history([[row("m1"), row("m2")]]));
  client.setQueryData(messagingKeys.unread(scope), []);

  cache.receive(
    change({ scope: "messages", conversationId: "c1", messageId: "m3", threadId: null }),
  );
  await settle();

  expect(afterReads).toEqual(["m2"]);
  expect(newestPage()).toEqual(["m1", "m2", "m3"]);
  expect(invalidated(timeline)).toBe(false);
  expect(invalidated(messagingKeys.unread(scope))).toBe(true);
});

test("a full page of newer messages may leave a gap, so the history is read again", async () => {
  const full = Array.from({ length: 50 }, (_, index) => row(`n${index}`));
  const { cache } = setup({ newer: () => full });
  client.setQueryData(timeline, history([[row("m1"), row("m2")]]));

  cache.receive(
    change({ scope: "messages", conversationId: "c1", messageId: "n0", threadId: null }),
  );
  await settle();

  expect(newestPage()).toEqual(["m1", "m2"]);
  expect(invalidated(timeline)).toBe(true);
});

test("a reply raises its root's reply count without reading the timeline", async () => {
  const { cache, afterReads } = setup({ rootReplies: 3 });
  client.setQueryData(timeline, history([[row("root", 2), row("m2")]]));

  cache.receive(
    change({ scope: "messages", conversationId: "c1", messageId: "r3", threadId: "root" }),
  );
  await settle();

  const root = client.getQueryData<InfiniteData<Row[]>>(timeline)?.pages[0]?.[0];
  expect(root?.replyCount).toBe(3);
  expect(invalidated(timeline)).toBe(false);
  expect(afterReads).toEqual([]);
});

test("a late reply count read cannot lower the count", async () => {
  const { cache } = setup({ rootReplies: 1 });
  client.setQueryData(timeline, history([[row("root", 4)]]));

  cache.receive(
    change({ scope: "messages", conversationId: "c1", messageId: "r1", threadId: "root" }),
  );
  await settle();

  expect(client.getQueryData<InfiniteData<Row[]>>(timeline)?.pages[0]?.[0]?.replyCount).toBe(4);
});

test("a read position refreshes only unread counts", async () => {
  const { cache } = setup();
  const conversations = messagingKeys.conversations(scope);
  client.setQueryData(conversations, []);
  client.setQueryData(messagingKeys.unread(scope), []);

  cache.receive(change({ scope: "read", conversationId: "c1" }));
  await settle();

  expect(invalidated(messagingKeys.unread(scope))).toBe(true);
  expect(invalidated(conversations)).toBe(false);
});

test("a new post marks message searches stale and leaves people searches alone", async () => {
  const { cache } = setup();
  const people = messagingKeys.search(scope, {
    organizationId: scope.organizationId,
    query: "a",
    kind: "person",
  });
  const messages = messagingKeys.search(scope, {
    organizationId: scope.organizationId,
    query: "a",
  });
  client.setQueryData(people, []);
  client.setQueryData(messages, []);

  cache.receive(
    change({ scope: "messages", conversationId: "c1", messageId: "m9", threadId: null }),
  );
  await settle();

  expect(invalidated(people)).toBe(false);
  expect(invalidated(messages)).toBe(true);
});

test("hints for another workspace and repeated hints refresh nothing more", async () => {
  const { cache } = setup();
  const unread = messagingKeys.unread(scope);
  client.setQueryData(unread, []);

  cache.receive(change({ organizationId: "org-2", scope: "read" }));
  await settle();
  expect(invalidated(unread)).toBe(false);

  const hint = change({ scope: "read" });
  cache.receive(hint);
  await settle();
  expect(invalidated(unread)).toBe(true);
  // A fresh read clears the staleness; the same hint again must not mark it stale.
  client.setQueryData(unread, []);
  cache.receive(hint);
  await settle();
  expect(invalidated(unread)).toBe(false);
});

test("an access recheck keeps mounted data on screen and drops unmounted data", async () => {
  const { cache } = setup();
  const mounted = messagingKeys.conversations(scope);
  const unmounted = messagingKeys.unread(scope);
  const disabled = messagingKeys.managed(scope);
  client.setQueryData(mounted, [{ id: "c1" }]);
  client.setQueryData(unmounted, [{ id: "c1" }]);
  client.setQueryData(disabled, [{ id: "c1" }]);
  const reading = new QueryObserver(client, {
    queryKey: mounted,
    queryFn: () => new Promise<{ id: string }[]>(() => {}),
  });
  const idle = new QueryObserver(client, { queryKey: disabled, enabled: false });
  const stop = [reading.subscribe(() => {}), idle.subscribe(() => {})];

  void cache.recheck();

  // The mounted view is read again; until then it keeps its rows.
  expect(reading.getCurrentResult().data).toEqual([{ id: "c1" }]);
  expect(reading.getCurrentResult().fetchStatus).toBe("fetching");
  expect(client.getQueryData(unmounted)).toBeUndefined();
  // A disabled view is not read again, so its old value cannot stay.
  expect(idle.getCurrentResult().data).toBeUndefined();
  for (const unsubscribe of stop) unsubscribe();
});
