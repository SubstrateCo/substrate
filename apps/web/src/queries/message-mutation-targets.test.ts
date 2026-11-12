import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "./keys";
import { invalidateChangedMessage } from "./messaging/message-mutations";
import { domainTargets, invalidateTargets } from "./targets";
import { expect, test } from "bun:test";

test("local message changes refresh their conversation and references, not other histories or profiles", async () => {
  const client = new QueryClient();
  const affected = [
    queryKeys.messages("org", "conversation"),
    queryKeys.messages("org", "conversation", "thread"),
    queryKeys.messageReactions("org", "conversation", "message"),
    queryKeys.messageUnread("org"),
    queryKeys.conversations("org"),
    queryKeys.related("org", "task"),
    queryKeys.activity("org", "task"),
    queryKeys.messagePage("org", "conversation", ["message"]),
    queryKeys.notifications("org"),
    [...queryKeys.search("org"), "term"],
  ];
  const untouched = [
    queryKeys.messages("org", "other"),
    queryKeys.messageReactions("org", "other", "message"),
    queryKeys.messagingProfile("org", "conversation", "actor"),
    queryKeys.messages("other-org", "conversation"),
  ];
  const reads = [...affected, ...untouched].map(() => 0);
  const stops = [...affected, ...untouched].map((queryKey, index) => {
    const read = async () => {
      reads[index]++;
      return ["updated"];
    };
    return new QueryObserver(client, {
      queryKey,
      initialData: ["old"],
      staleTime: Infinity,
      queryFn: () => read(),
    }).subscribe(() => {});
  });
  try {
    await invalidateChangedMessage(client, "org", "conversation");
    expect(reads).toEqual([...affected.map(() => 1), ...untouched.map(() => 0)]);
    for (const key of affected) expect(client.getQueryData(key)).toEqual(["updated"]);
    for (const key of untouched) expect(client.getQueryData(key)).toEqual(["old"]);
  } finally {
    stops.forEach((stop) => stop());
    client.clear();
  }
});

for (const staleFirst of [true, false]) {
  test(`refreshing targets override overlapping stale-only targets (stale first: ${staleFirst})`, async () => {
    const client = new QueryClient();
    const key = [...queryKeys.search("org"), "term"];
    let reads = 0;
    const read = async () => {
      reads++;
      return ["updated"];
    };
    const observer = new QueryObserver(client, {
      queryKey: key,
      initialData: ["old"],
      staleTime: Infinity,
      queryFn: () => read(),
    });
    const stop = observer.subscribe(() => {});
    const stale = { queryKey: queryKeys.search("org"), refetchType: "none" } as const;
    const refresh = { queryKey: queryKeys.context("org") };
    try {
      await invalidateTargets(client, staleFirst ? [stale, refresh] : [refresh, stale]);
      expect(reads).toBe(1);
      expect(observer.getCurrentResult().data).toEqual(["updated"]);
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    } finally {
      stop();
      client.clear();
    }
  });
}

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
