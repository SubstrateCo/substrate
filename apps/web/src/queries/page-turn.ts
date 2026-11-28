import { hashKey, type Query, type QueryKey } from "@tanstack/react-query";

export function keepPageWhileTurning<T>(queryKey: QueryKey) {
  const list = hashKey(queryKey.slice(0, -1));
  return (previous: T | undefined, query: Pick<Query, "queryKey"> | undefined) =>
    query && hashKey(query.queryKey.slice(0, -1)) === list ? previous : undefined;
}
