import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { expect, test } from "bun:test";

test("resync reads each active query once", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const reads = new Map<string, number>();
  const observe = (name: string, queryKey: readonly unknown[]) => {
    const observer = new QueryObserver(client, {
      queryKey,
      staleTime: Infinity,
      queryFn: async () => {
        reads.set(name, (reads.get(name) ?? 0) + 1);
        return [name];
      },
    });
    return observer.subscribe(() => {});
  };
  const unsubscribe = [
    observe("messages", queryKeys.messages("org", "conversation")),
    observe("session", queryKeys.session),
    observe("release", ["desktop", "release"]),
  ];
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    reads.clear();
    await cache.resync();
    expect(Object.fromEntries(reads)).toEqual({ messages: 1, session: 1, release: 1 });
  } finally {
    cache.dispose();
    for (const stop of unsubscribe) stop();
    client.clear();
  }
});

test("resync removes private content when access was lost while hints were missed", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = queryKeys.messages("org", "private");
  client.setQueryData(key, ["formerly visible"]);
  const denied = Promise.withResolvers<string[]>();
  const read = () => denied.promise;
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: () => read(),
  });
  const unsubscribe = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    const pending = cache.resync();
    expect(observer.getCurrentResult().data).toBeUndefined();
    denied.reject(new Error("Access denied"));
    await pending;
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(client.getQueryData(key)).toBeUndefined();
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});
