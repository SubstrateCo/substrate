import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { invalidateMessageWork } from "./mutations";
import { expect, test } from "bun:test";

test("link changes refresh only the affected message pages, links, work and project discussions/activity", async () => {
  const client = new QueryClient();
  const context = queryKeys.context("org");
  const keys = [
    [...context, "message-pages", "conversation", ["message"]],
    [...context, "related", "task"],
    [...context, "related", "project"],
    [...context, "activity", "task"],
    [...context, "message-pages", "conversation", ["other"]],
    [...context, "related", "other"],
    [...context, "notifications"],
    queryKeys.projects("org"),
    queryKeys.conversations("org"),
    [...context, "search", "term"],
    [...context, "search-pages", "term"],
    [...queryKeys.context("other"), "message-pages", "conversation", ["message"]],
  ];
  const reads = keys.map(() => 0);
  const observers = keys.map((queryKey, index) => {
    const read = async () => {
      reads[index]++;
      return ["fresh"];
    };
    return new QueryObserver(client, {
      queryKey,
      initialData: ["old"],
      staleTime: Infinity,
      queryFn: () => read(),
    });
  });
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
  try {
    await client.invalidateQueries({ queryKey: queryKeys.organization("org") });
    expect(reads.reduce((sum, count) => sum + count, 0)).toBe(11);
    reads.fill(0);
    await invalidateMessageWork(client, "org", "message", "task", "project");
    expect(reads).toEqual([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(observers[0]!.getCurrentResult().data).toEqual(["fresh"]);
    expect(client.getQueryState(keys[9]!)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys[10]!)?.isInvalidated).toBe(true);
  } finally {
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    client.clear();
  }
});
