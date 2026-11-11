import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "./keys";
import { domainTargets, invalidateTargets } from "./targets";
import { expect, test } from "bun:test";

test("message edits and deletions refresh open search excerpts without touching another workspace", async () => {
  for (const stored of [["corrected message"], []]) {
    const client = new QueryClient();
    const key = [...queryKeys.searches("org")[0]!, "launch"];
    const other = [...queryKeys.searches("other")[0]!, "launch"];
    client.setQueryData(key, ["original message"]);
    client.setQueryData(other, ["another workspace"]);
    const observer = new QueryObserver(client, {
      queryKey: key,
      staleTime: Infinity,
      queryFn: async () => stored,
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
      await invalidateTargets(client, domainTargets("messaging", "org", "conversation"));
      expect(observer.getCurrentResult().data).toEqual(stored);
      expect(client.getQueryData(other)).toEqual(["another workspace"]);
      expect(client.getQueryState(other)?.isInvalidated).toBe(false);
    } finally {
      unsubscribe();
      client.clear();
    }
  }
});
