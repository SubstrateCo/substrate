import { hashKey, type Query, type QueryKey } from "@tanstack/react-query";

/**
 * Placeholder data for a page turn: while the next page of the same list loads, keep showing
 * the current one. Only the key's last part, the page cursor, may differ; a new search or filter
 * starts from its own loading state instead of showing rows that do not match it.
 */
export function keepPageWhileTurning<T>(queryKey: QueryKey) {
  const list = hashKey(queryKey.slice(0, -1));
  return (previous: T | undefined, query: Pick<Query, "queryKey"> | undefined) =>
    query && hashKey(query.queryKey.slice(0, -1)) === list ? previous : undefined;
}
