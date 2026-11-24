import { InfiniteQueryObserver, QueryClient, QueryObserver } from "@tanstack/react-query";

import { keepFirstPage } from "./first-page";
import { expect, test } from "bun:test";

const feed = { pages: [["a"], ["b"], ["c"]], pageParams: [undefined, "b", "c"] };

test("a closed deep list keeps only its first page and its read time", () => {
  const client = new QueryClient();
  const key = ["org", "notifications", "groups", "all"];
  client.setQueryData(key, feed, { updatedAt: 1_000 });
  keepFirstPage(client, key);
  expect(client.getQueryData(key)).toEqual({ pages: [["a"]], pageParams: [undefined] });
  expect(client.getQueryState(key)?.dataUpdatedAt).toBe(1_000);
});

test("a deep list closed and refreshed later costs one request, not one per page", async () => {
  const client = new QueryClient();
  const key = ["org", "notifications", "groups", "all"];
  const requests: (string | undefined)[] = [];
  const firstPage: string | undefined = undefined;
  const options = {
    queryKey: key,
    initialPageParam: firstPage,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => {
      requests.push(pageParam);
      return Promise.resolve({ next: pageParam ? undefined : "older" });
    },
    getNextPageParam: (page: { next?: string }) => page.next,
  };
  const observer = new InfiniteQueryObserver(client, options);
  const stop = observer.subscribe(() => {});
  await observer.refetch();
  await observer.fetchNextPage();
  stop();
  keepFirstPage(client, key);
  requests.length = 0;
  await client.refetchQueries({ queryKey: key, type: "all" });
  expect(requests).toEqual([undefined]);
});

test("a list someone still views keeps all its pages", () => {
  const client = new QueryClient();
  const key = ["org", "notifications", "groups", "all"];
  client.setQueryData(key, feed);
  const stop = new QueryObserver(client, { queryKey: key, enabled: false }).subscribe(() => {});
  keepFirstPage(client, key);
  expect(client.getQueryData(key)).toEqual(feed);
  stop();
});
