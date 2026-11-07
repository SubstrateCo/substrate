import { QueryClient, QueryObserver, type QueryKey } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { expect, test } from "bun:test";

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
  observer.setOptions({
    queryKey: latestKey,
    retry: false,
    queryFn: () => (++reads === 1 ? older.promise : authorized.promise),
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
    await new Promise((resolve) => setTimeout(resolve, 0));
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
