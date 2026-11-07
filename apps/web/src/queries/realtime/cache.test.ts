import type { RealtimeEvent } from "@startup-os/contracts/realtime";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createRealtimeCache, realtimeQueryTargets } from "./cache";
import { expect, test } from "bun:test";

function change(
  domain: Extract<RealtimeEvent, { type: "change" }>["domain"],
  organizationId: string | null = "org",
) {
  return { version: 1, type: "change", id: crypto.randomUUID(), organizationId, domain } as const;
}

test("workspace profile changes refresh actor names across domains and the session", () => {
  expect(realtimeQueryTargets(change("profile"), "user")).toEqual([
    { queryKey: queryKeys.session },
    { queryKey: queryKeys.messaging("org") },
    { queryKey: queryKeys.context("org") },
    { queryKey: queryKeys.tasks("org") },
  ]);
  expect(realtimeQueryTargets(change("profile", null), "user")).toEqual([
    { queryKey: queryKeys.session },
  ]);
});

test("organization invitations refresh user lists without an active workspace", () => {
  expect(realtimeQueryTargets(change("organization", null), "user")).toEqual([
    { queryKey: queryKeys.organizations },
    { queryKey: queryKeys.userInvitations },
  ]);
});

test("messaging targets all thread variants of one conversation, not another", () => {
  const targets = realtimeQueryTargets(
    { ...change("messaging"), conversationId: "conversation" },
    "user",
  );
  expect(targets).toEqual([
    { queryKey: queryKeys.conversations("org") },
    { queryKey: queryKeys.messages("org", "conversation").slice(0, -1) },
    { queryKey: [...queryKeys.context("org"), "related"] },
    { queryKey: [...queryKeys.context("org"), "search"], refetchType: "none" },
    { queryKey: [...queryKeys.context("org"), "search-pages"], refetchType: "none" },
  ]);
  expect(realtimeQueryTargets(change("notifications"), "user")).toEqual([
    { queryKey: [...queryKeys.context("org"), "notifications"], exact: true },
  ]);
  expect(realtimeQueryTargets(change("agents", null), "user")).toEqual([
    { queryKey: queryKeys.agents("user") },
  ]);
});

test("task activity and related context refresh while task/message search becomes stale without a refetch storm", async () => {
  for (const domain of ["tasks", "messaging"] as const) {
    const client = new QueryClient();
    const context = queryKeys.context("org");
    const keys = {
      activity: [...context, "activity", "task"],
      related: [...context, "related", "task"],
      search: [...context, "search", { query: "task" }],
      pages: [...context, "search-pages", { query: "message" }],
      notifications: [...context, "notifications"],
    };
    let searchFetches = 0;
    const observer = new QueryObserver(client, {
      queryKey: keys.search,
      initialData: ["existing"],
      staleTime: Infinity,
      queryFn: async () => {
        searchFetches++;
        return ["updated"];
      },
    });
    const unsubscribe = observer.subscribe(() => {});
    for (const key of Object.values(keys)) client.setQueryData(key, ["existing"]);
    const cache = createRealtimeCache({
      queryClient: client,
      organizationId: "org",
      userId: "user",
      revalidate: async () => {},
    });
    await cache.receive(change(domain));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(client.getQueryState(keys.activity)?.isInvalidated).toBe(domain === "tasks");
    expect(client.getQueryState(keys.related)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.search)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.pages)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.notifications)?.isInvalidated).toBe(domain === "tasks");
    expect(searchFetches).toBe(0);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("access clears private organization and harness data before revalidation, preserving other workspaces", async () => {
  const client = new QueryClient();
  const privateKey = queryKeys.project("org", "project");
  const harnessKey = queryKeys.localAgentConfiguration("user", "org", "local");
  const otherKey = queryKeys.project("other", "project");
  client.setQueryData(privateKey, "private");
  client.setQueryData(harnessKey, "private config");
  client.setQueryData(otherKey, "other");
  let revalidated = 0;
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {
      expect(client.getQueryData(privateKey)).toBeUndefined();
      expect(client.getQueryData(harnessKey)).toBeUndefined();
      revalidated++;
    },
  });
  await cache.receive(change("access", "other"));
  expect(client.getQueryData(privateKey)).toBe("private");
  await cache.receive(change("access"));
  expect(revalidated).toBe(1);
  expect(client.getQueryData(otherKey)).toBe("other");
  cache.dispose();
  client.clear();
});

test("task edits refresh titles shown by message links and existing notifications", async () => {
  const client = new QueryClient();
  const keys = [
    [...queryKeys.context("org"), "message", "message"],
    [...queryKeys.context("org"), "notifications"],
  ];
  for (const key of keys) client.setQueryData(key, [{ title: "Old task title" }]);
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  await cache.receive(change("tasks"));
  await new Promise((resolve) => setTimeout(resolve, 80));
  for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  cache.dispose();
  client.clear();
});

test("duplicate changes coalesce and ready resyncs cached state", async () => {
  const client = new QueryClient();
  const key = queryKeys.projects("org");
  client.setQueryData(key, []);
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  const event = change("tasks");
  await cache.receive(event);
  await cache.receive(event);
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  client.setQueryData(key, ["new"]);
  await cache.receive(event);
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  await cache.receive({ version: 1, type: "ready" });
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  cache.dispose();
  client.clear();
});

test("changes during a slow refresh share one follow-up snapshot", async () => {
  const client = new QueryClient();
  const key = queryKeys.messages("org", "conversation");
  const first = Promise.withResolvers<void>();
  let snapshot = 0;
  let reads = 0;
  const observer = new QueryObserver(client, {
    queryKey: key,
    initialData: 0,
    staleTime: Infinity,
    queryFn: async () => {
      const value = snapshot;
      if (++reads === 1) await first.promise;
      return value;
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  const threadKey = queryKeys.messages("org", "conversation", "thread");
  let threadReads = 0;
  const threadObserver = new QueryObserver(client, {
    queryKey: threadKey,
    initialData: 0,
    staleTime: Infinity,
    queryFn: async () => {
      threadReads++;
      return snapshot;
    },
  });
  const unsubscribeThread = threadObserver.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    snapshot++;
    await cache.receive(change("messaging"));
    await new Promise((resolve) => setTimeout(resolve, 80));
    for (let index = 0; index < 4; index++) {
      snapshot++;
      await cache.receive(change("messaging"));
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    first.resolve();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(client.getQueryData(key)).toBe(snapshot);
    expect(client.getQueryData(threadKey)).toBe(snapshot);
    expect(reads).toBe(2);
    expect(threadReads).toBe(2);
  } finally {
    first.resolve();
    cache.dispose();
    unsubscribe();
    unsubscribeThread();
    client.clear();
  }
});
