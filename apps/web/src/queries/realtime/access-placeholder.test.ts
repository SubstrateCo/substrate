import { advanceTimersAsync } from "@substrate/contracts/testing/timers";

import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";

import { messagePageOptions } from "../context/links";
import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { afterEach, beforeEach, expect, vi, test } from "bun:test";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const access = () =>
  ({
    version: 1,
    type: "change",
    id: crypto.randomUUID(),
    organizationId: "org",
    domain: "access",
  }) as const;

const forbidden = () => Object.assign(new Error("Forbidden"), { status: 403 });

test("an access recheck keeps the history page shown as placeholder until a denial clears it", async () => {
  const client = new QueryClient();
  const prefix = queryKeys.messages("org", "conversation");
  const olderKey: QueryKey = [...prefix, { beforeMessageId: "older" }];
  const latestKey: QueryKey = [...prefix, {}];
  client.setQueryData(olderKey, ["private history"]);
  const reads: ReturnType<typeof Promise.withResolvers<string[]>>[] = [];
  const observer = new QueryObserver(client, {
    queryKey: olderKey,
    staleTime: Infinity,
    queryFn: async () => ["private history"],
  });
  const unsubscribe = observer.subscribe(() => {});
  observer.setOptions({
    queryKey: latestKey,
    retry: false,
    queryFn: () => {
      reads.push(Promise.withResolvers<string[]>());
      return reads.at(-1)!.promise;
    },
    placeholderData: (previous, query) =>
      prefix.every((part, index) => query?.queryKey[index] === part) ? previous : undefined,
  });
  const cache = createRealtimeCache({
    queryClient: client,
    userId: "user",
    organizationId: "org",
    revalidate: async () => {},
  });
  try {
    expect(observer.getCurrentResult().data).toEqual(["private history"]);
    const reset = cache.receive(access());
    await advanceTimersAsync(0);
    // The unmounted page left the cache, but the view keeps it until the recheck answers.
    expect(client.getQueryData(olderKey)).toBeUndefined();
    expect(observer.getCurrentResult().data).toEqual(["private history"]);
    reads.at(-1)!.reject(forbidden());
    await reset;
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(observer.getCurrentResult().status).toBe("error");
    // The read that the recheck replaced cannot bring the old page back.
    reads[0]!.resolve(["obsolete private history"]);
    await advanceTimersAsync(0);
    expect(observer.getCurrentResult().data).toBeUndefined();
  } finally {
    for (const read of reads) read.resolve([]);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("an access recheck keeps a message context placeholder until a denial clears it", async () => {
  const client = new QueryClient();
  type Page = Awaited<ReturnType<NonNullable<ReturnType<typeof messagePageOptions>["queryFn"]>>>;
  const page = (messageId: string): Page[number] => ({
    messageId,
    messaging: [],
    links: [],
    people: [],
    agents: [],
  });
  const reads: ReturnType<typeof Promise.withResolvers<Page>>[] = [];
  const observer = new QueryObserver(client, {
    ...messagePageOptions("org", "conversation", ["one"]),
    queryFn: async () => [page("one")],
  });
  const unsubscribe = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    userId: "user",
    organizationId: "org",
    revalidate: async () => {},
  });
  try {
    await observer.refetch();
    // A new message changes the key; the visible page stays as placeholder data.
    observer.setOptions({
      ...messagePageOptions("org", "conversation", ["one", "two"]),
      queryFn: () => {
        reads.push(Promise.withResolvers<Page>());
        return reads.at(-1)!.promise;
      },
    });
    expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    const reset = cache.receive(access());
    await advanceTimersAsync(0);
    expect(observer.getCurrentResult().data).toEqual([page("one")]);
    reads.at(-1)!.reject(forbidden());
    await reset;
    expect(observer.getCurrentResult().data).toBeUndefined();
  } finally {
    for (const read of reads) read.resolve([]);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});
