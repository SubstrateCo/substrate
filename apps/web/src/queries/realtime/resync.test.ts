import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { expect, test } from "bun:test";

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
