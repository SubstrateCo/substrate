import { advanceTimersAsync } from "@substrate/contracts/testing/timers";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { messagesQueryOptions } from "../messaging/options";
import { createRealtimeCache } from "./cache";
import type { MessageTarget } from "@/api/context/links";
import type { listMessages, Message } from "@/api/messaging/requests";
import { afterEach, beforeEach, expect, vi, test } from "bun:test";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

// SAFETY: the cache only reads and appends rows by ID.
const row = (id: string) => ({ id }) as Message;
const ids = (rows: Message[] | undefined) => rows?.map((message) => message.id);

function fixture({ stored, threadId }: { stored: Message[]; threadId?: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fullReads: number[] = [];
  const afterReads: (string | undefined)[] = [];
  const options = messagesQueryOptions("org", "conversation", threadId);
  const observer = new QueryObserver(client, {
    ...options,
    staleTime: Infinity,
    queryFn: async () => {
      fullReads.push(1);
      return stored.slice(-50);
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  // SAFETY: the cache reads only `data.afterMessageId` and the returned rows' IDs.
  const load = (async ({ data }: Parameters<typeof listMessages>[0]) => {
    afterReads.push(data.afterMessageId);
    const index = stored.findIndex((message) => message.id === data.afterMessageId);
    return stored.slice(index + 1).slice(-50);
  }) as typeof listMessages;
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
    loadMessages: load,
  });
  const hint = (messageId: string) =>
    cache.receive({
      version: 1,
      type: "change",
      id: crypto.randomUUID(),
      organizationId: "org",
      domain: "messaging",
      conversationId: "conversation",
      scope: "messages",
      messageId,
      threadId: threadId ?? null,
    });
  return {
    client,
    observer,
    fullReads,
    afterReads,
    hint,
    async loaded() {
      await observer.refetch();
      fullReads.length = 0;
    },
    close() {
      cache.dispose();
      unsubscribe();
      client.clear();
    },
  };
}

test("a new-message hint reads only the messages after the loaded page", async () => {
  const stored = [row("a"), row("b")];
  const f = fixture({ stored });
  try {
    await f.loaded();
    stored.push(row("c"));
    await f.hint("c");
    await advanceTimersAsync(10);
    expect(f.afterReads).toEqual(["b"]);
    expect(f.fullReads).toEqual([]);
    expect(ids(f.observer.getCurrentResult().data)).toEqual(["a", "b", "c"]);
  } finally {
    f.close();
  }
});

test("a reply hint appends to the open thread the same way", async () => {
  const stored = [row("reply-1")];
  const f = fixture({ stored, threadId: "root" });
  try {
    await f.loaded();
    stored.push(row("reply-2"));
    await f.hint("reply-2");
    await advanceTimersAsync(10);
    expect(f.afterReads).toEqual(["reply-1"]);
    expect(ids(f.observer.getCurrentResult().data)).toEqual(["reply-1", "reply-2"]);
  } finally {
    f.close();
  }
});

test("a hint for a message the page already has reads nothing", async () => {
  const stored = [row("a"), row("b")];
  const f = fixture({ stored });
  try {
    await f.loaded();
    await f.hint("b");
    await advanceTimersAsync(10);
    expect(f.afterReads).toEqual([]);
    expect(f.fullReads).toEqual([]);
  } finally {
    f.close();
  }
});

test("a full page of newer messages may hide a gap, so the page is read again in full", async () => {
  const stored = [row("a")];
  const f = fixture({ stored });
  try {
    await f.loaded();
    stored.push(...Array.from({ length: 60 }, (_, index) => row(`new-${index}`)));
    await f.hint("new-59");
    await advanceTimersAsync(10);
    expect(f.afterReads).toEqual(["a"]);
    expect(f.fullReads).toHaveLength(1);
    const data = f.observer.getCurrentResult().data;
    expect(data).toHaveLength(50);
    expect(data?.at(-1)?.id).toBe("new-59");
  } finally {
    f.close();
  }
});

test("a page with a read in flight is read again in full after it, not appended to", async () => {
  const stored = [row("a")];
  const f = fixture({ stored });
  try {
    await f.loaded();
    const inflight = f.observer.refetch();
    stored.push(row("b"));
    await f.hint("b");
    await inflight;
    await advanceTimersAsync(10);
    expect(f.afterReads).toEqual([]);
    expect(f.fullReads).toHaveLength(2);
    expect(ids(f.observer.getCurrentResult().data)).toEqual(["a", "b"]);
  } finally {
    f.close();
  }
});

function replyFixture(rootCounts: number[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let timelineReads = 0;
  const targetReads: string[] = [];
  const observer = new QueryObserver(client, {
    ...messagesQueryOptions("org", "conversation"),
    staleTime: Infinity,
    // SAFETY: the cache reads only IDs and reply counts.
    initialData: [{ id: "root", replyCount: 1 } as Message, row("other")],
    queryFn: async () => {
      timelineReads++;
      return [];
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
    loadTarget: async (_organizationId, _conversationId, messageId) => {
      targetReads.push(messageId);
      const root = { id: messageId, replyCount: rootCounts.shift() ?? 0 };
      // SAFETY: reply counts read only the target's root ID and count.
      return { root, message: root } as MessageTarget;
    },
  });
  const reply = (threadId: string) =>
    cache.receive({
      version: 1,
      type: "change",
      id: crypto.randomUUID(),
      organizationId: "org",
      domain: "messaging",
      conversationId: "conversation",
      scope: "messages",
      messageId: crypto.randomUUID(),
      threadId,
    });
  const rootCount = () =>
    observer.getCurrentResult().data?.find((message) => message.id === "root")?.replyCount;
  return {
    reply,
    rootCount,
    targetReads,
    reads: () => timelineReads,
    close() {
      cache.dispose();
      unsubscribe();
      client.clear();
    },
  };
}

test("a reply hint reads only its root and raises the root's reply count in the timeline", async () => {
  const f = replyFixture([3]);
  try {
    await f.reply("root");
    await advanceTimersAsync(10);
    expect(f.targetReads).toEqual(["root"]);
    expect(f.rootCount()).toBe(3);
    expect(f.reads()).toBe(0);
  } finally {
    f.close();
  }
});

test("a late root read cannot lower the reply count", async () => {
  const f = replyFixture([3, 2]);
  try {
    await f.reply("root");
    await f.reply("root");
    await advanceTimersAsync(10);
    expect(f.rootCount()).toBe(3);
  } finally {
    f.close();
  }
});

test("a reply to a root that no loaded page shows reads nothing for the timeline", async () => {
  const f = replyFixture([5]);
  try {
    await f.reply("elsewhere");
    await advanceTimersAsync(10);
    expect(f.targetReads).toEqual([]);
    expect(f.reads()).toBe(0);
    expect(f.rootCount()).toBe(1);
  } finally {
    f.close();
  }
});

test("appended pages keep the newest page size", async () => {
  const stored = Array.from({ length: 50 }, (_, index) => row(`old-${index}`));
  const f = fixture({ stored });
  try {
    await f.loaded();
    stored.push(row("new"));
    await f.hint("new");
    await advanceTimersAsync(10);
    const data = f.observer.getCurrentResult().data;
    expect(data).toHaveLength(50);
    expect(data?.[0]?.id).toBe("old-1");
    expect(data?.at(-1)?.id).toBe("new");
  } finally {
    f.close();
  }
});
