import {
  hashKey,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import { useEffect } from "react";

/**
 * Drops every page after the first from an infinite query nobody observes. A refetch reads each
 * cached page again, one after another, so a deep list left in the cache would cost one request
 * per page on its next refresh.
 */
export function keepFirstPage(client: QueryClient, queryKey: QueryKey) {
  const query = client.getQueryCache().find<InfiniteData<unknown>>({ queryKey, exact: true });
  const data = query?.state.data;
  const deep = data !== undefined && data.pages.length > 1;
  if (!query || !deep || query.getObserversCount() > 0) return;
  client.setQueryData<InfiniteData<unknown>>(
    queryKey,
    { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) },
    // Keep the read time: the first page is no fresher than before.
    { updatedAt: query.state.dataUpdatedAt },
  );
}

/** Keeps only the first page of a deep list once the view that loaded it closes. */
export function useFirstPageOnLeave(queryKey: QueryKey) {
  const client = useQueryClient();
  // Callers build a new key array each render; its hash changes only with the key.
  const hash = hashKey(queryKey);
  useEffect(() => {
    // SAFETY: hashKey is the JSON of the key, and query keys here hold only JSON values.
    const key = JSON.parse(hash) as QueryKey;
    return () => {
      // The view's observer unsubscribes after this cleanup runs.
      queueMicrotask(() => keepFirstPage(client, key));
    };
  }, [client, hash]);
}
