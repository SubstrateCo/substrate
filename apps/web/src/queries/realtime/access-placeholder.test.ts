import { advanceTimersAsync } from "@substrate/contracts/testing/timers";

import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";

import { messagePageOptions } from "../context/links";
import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { afterEach, beforeEach, expect, vi, test } from "bun:test";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("access reset clears the previous history page used as message placeholder data", async () => {
  const client = new QueryClient();
  const prefix = queryKeys.messages("org", "conversation");
  const olderKey: QueryKey = [...prefix, { beforeMessageId: "older" }];
  const latestKey: QueryKey = [...prefix, {}];
  client.setQueryData(olderKey, ["private history"]);
  const previousQuery = client.getQueryCache().find({ queryKey: olderKey })!;
  const older = Promise.withResolvers<string[]>();
  const authorized = Promise.withResolvers<string[]>();
  let reads = 0;
  const observer = new QueryObserver(client, {
    queryKey: olderKey,
    staleTime: Infinity,
    queryFn: async () => ["private history"],
  });
  const unsubscribe = observer.subscribe(() => {});
  const read = () => (++reads === 1 ? older.promise : authorized.promise);
  observer.setOptions({
    queryKey: latestKey,
    retry: false,
    queryFn: () => read(),
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
    const reset = cache.receive({
      version: 1,
      type: "change",
      id: crypto.randomUUID(),
      organizationId: "org",
      domain: "access",
    });
    await advanceTimersAsync(0);
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(previousQuery.state.data).toBeUndefined();
    authorized.resolve([]);
    older.resolve(["obsolete private history"]);
    await reset;
    expect(observer.getCurrentResult().data).toEqual([]);
  } finally {
    older.resolve([]);
    authorized.resolve([]);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("access reset clears a previous message context page kept as placeholder data", async () => {
  const client = new QueryClient();
  type Page = Awaited<ReturnType<NonNullable<ReturnType<typeof messagePageOptions>["queryFn"]>>>;
  const page = (messageId: string): Page[number] => ({
    messageId,
    messaging: [],
    links: [],
    people: [],
    agents: [],
  });
  const loading = Promise.withResolvers<Page>();
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
      queryFn: () => loading.promise,
    });
    expect(observer.getCurrentResult().data).toEqual([page("one")]);
    expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    const reset = cache.receive({
      version: 1,
      type: "change",
      id: crypto.randomUUID(),
      organizationId: "org",
      domain: "access",
    });
    await advanceTimersAsync(0);
    expect(observer.getCurrentResult().data).toBeUndefined();
    loading.resolve([]);
    await reset;
  } finally {
    loading.resolve([]);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});
