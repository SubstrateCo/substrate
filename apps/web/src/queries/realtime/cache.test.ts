import type { RealtimeEvent } from "@substrate/contracts/realtime";

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

test("a task hint during an in-flight read stays stale when its panel becomes hidden", async () => {
  const client = new QueryClient();
  const key = queryKeys.taskComments("org", "project", "task");
  const first = Promise.withResolvers<string[]>();
  let reads = 0;
  const read = async () => (++reads === 1 ? first.promise : ["fresh"]);
  const options = {
    queryKey: key,
    staleTime: Infinity,
    queryFn: () => read(),
  };
  const observer = new QueryObserver(client, options);
  const unsubscribe = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    await cache.receive(change("tasks"));
    await new Promise((resolve) => setTimeout(resolve, 25));
    observer.setOptions({ ...options, enabled: false });
    first.resolve(["old snapshot"]);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(reads).toBe(1);
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    observer.setOptions({ ...options, enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getQueryData(key)).toEqual(["fresh"]);
    expect(reads).toBe(2);
  } finally {
    first.resolve([]);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

for (const domain of ["context", "profile"] as const) {
  for (const overlap of ["none", "before", "after"] as const) {
    test(`in-flight search respects stale-only policy across overlapping task/${domain} events (${overlap})`, async () => {
      const client = new QueryClient();
      const key = [...queryKeys.context("org"), "search", "task"];
      const first = Promise.withResolvers<string[]>();
      let reads = 0;
      const read = async () => (++reads === 1 ? first.promise : ["fresh"]);
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
        batchMs: 5,
      });
      try {
        if (overlap === "before") await cache.receive(change(domain));
        await cache.receive(change("tasks"));
        if (overlap === "after") await cache.receive(change(domain));
        await Bun.sleep(25);
        first.resolve(["old snapshot"]);
        await Bun.sleep(25);
        const refresh = domain === "profile" && overlap !== "none";
        expect(reads).toBe(refresh ? 2 : 1);
        expect(client.getQueryState(key)?.isInvalidated).toBe(!refresh);
        expect(client.getQueryData(key)).toEqual(refresh ? ["fresh"] : ["old snapshot"]);
      } finally {
        first.resolve([]);
        cache.dispose();
        unsubscribe();
        client.clear();
      }
    });
  }
}

test("access resets clear hidden task data without issuing hidden reads", async () => {
  const client = new QueryClient();
  const key = queryKeys.taskComments("org", "project", "task");
  let reads = 0;
  const read = async () => {
    reads++;
    return ["private"];
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    enabled: false,
    queryFn: () => read(),
  });
  const unsubscribe = observer.subscribe(() => {});
  client.setQueryData(key, ["private"]);
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    const reset = cache.receive(change("access"));
    expect(client.getQueryData(key)).toBeUndefined();
    expect(observer.getCurrentResult().data).toBeUndefined();
    await reset;
    expect(reads).toBe(0);
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

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
    { queryKey: queryKeys.conversationReactions("org", "conversation") },
    { queryKey: [...queryKeys.context("org"), "related"] },
    { queryKey: [...queryKeys.context("org"), "message-pages", "conversation"] },
    { queryKey: [...queryKeys.context("org"), "target", "conversation"] },
    { queryKey: [...queryKeys.context("org"), "search"], refetchType: "none" },
    { queryKey: [...queryKeys.context("org"), "search-pages"], refetchType: "none" },
  ]);
  expect(realtimeQueryTargets(change("notifications"), "user")).toEqual([
    { queryKey: [...queryKeys.context("org"), "notifications"] },
  ]);
  expect(realtimeQueryTargets(change("agents", null), "user")).toEqual([
    { queryKey: queryKeys.agents("user") },
  ]);
});

test("new messages refresh history, not conversation lists or loaded message context", () => {
  const targets = realtimeQueryTargets(
    { ...change("messaging"), conversationId: "conversation", scope: "messages" },
    "user",
  );
  const pages = { queryKey: [...queryKeys.context("org"), "message-pages", "conversation"] };
  expect(targets).not.toContainEqual({ queryKey: queryKeys.conversations("org") });
  expect(targets).not.toContainEqual(pages);
  expect(targets).toEqual(
    realtimeQueryTargets({ ...change("messaging"), conversationId: "conversation" }, "user").filter(
      (target) =>
        JSON.stringify(target) !== JSON.stringify({ queryKey: queryKeys.conversations("org") }) &&
        JSON.stringify(target) !== JSON.stringify(pages),
    ),
  );
});

test("a new-message hint reads history once and loaded message context not at all", async () => {
  const client = new QueryClient();
  const reads = { messages: 0, pages: 0, reactions: 0 };
  const observe = (queryKey: readonly unknown[], kind: keyof typeof reads) => {
    const read = async () => {
      reads[kind]++;
      return [];
    };
    return new QueryObserver(client, {
      queryKey,
      staleTime: Infinity,
      queryFn: () => read(),
    }).subscribe(() => {});
  };
  const unsubscribe = [
    observe(queryKeys.messages("org", "conversation"), "messages"),
    observe(queryKeys.messageReactions("org", "conversation", "message"), "reactions"),
    observe([...queryKeys.context("org"), "message-pages", "conversation", ["m1", "m2"]], "pages"),
  ];
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await cache.receive({
      ...change("messaging"),
      conversationId: "conversation",
      scope: "messages",
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(reads).toEqual({ messages: 2, pages: 1, reactions: 2 });
    await cache.receive({ ...change("messaging"), conversationId: "conversation" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(reads).toEqual({ messages: 3, pages: 2, reactions: 3 });
  } finally {
    cache.dispose();
    for (const stop of unsubscribe) stop();
    client.clear();
  }
});

test("workspace detail changes refresh organization details and invitations, not workspace records", () => {
  const client = new QueryClient();
  const refreshed = [
    queryKeys.organizations,
    queryKeys.userInvitations,
    queryKeys.organizationDetail("org"),
    queryKeys.invitations("org"),
    queryKeys.activeMember("org"),
  ];
  const kept = [
    queryKeys.conversations("org"),
    queryKeys.projects("org"),
    [...queryKeys.context("org"), "related", "task"],
  ];
  for (const key of [...refreshed, ...kept]) client.setQueryData(key, []);
  const matched = (domain: "organization" | "access") =>
    new Set(
      realtimeQueryTargets(change(domain), "user").flatMap((target) =>
        client
          .getQueryCache()
          .findAll(target)
          .map((query) => query.queryHash),
      ),
    ).size;
  expect(matched("organization")).toBe(refreshed.length);
  // Access changes can hide or reveal any workspace record.
  expect(matched("access")).toBe(refreshed.length + kept.length);
  client.clear();
});

test("agent-work hints refresh only the owner's agent work in that workspace", () => {
  const [target] = realtimeQueryTargets(change("agent-work"), "user");
  expect(target).toEqual({ queryKey: queryKeys.agentWork("user", "org") });
  const client = new QueryClient();
  const keys = [
    queryKeys.agentWorkRequests("user", "org", "conversation"),
    queryKeys.agentWorkConversation("user", "org", "conversation"),
    queryKeys.agentWorkRequests("user", "other", "conversation"),
    queryKeys.agentWorkNeedsYou("other", "org"),
  ];
  for (const key of keys) client.setQueryData(key, []);
  expect(
    client
      .getQueryCache()
      .findAll({ queryKey: target!.queryKey })
      .map((query) => query.queryKey),
  ).toEqual(keys.slice(0, 2));
  client.clear();
});

test("an access change drops the owner's cached agent work for that workspace only", async () => {
  const client = new QueryClient();
  const here = queryKeys.agentWorkNeedsYou("user", "org");
  const local = queryKeys.agentWorkConversation("user", "org", "conversation");
  const elsewhere = queryKeys.agentWorkNeedsYou("user", "other");
  for (const key of [here, local, elsewhere]) client.setQueryData(key, { requests: [] });
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    await cache.receive(change("access"));
    expect(client.getQueryData(here)).toBeUndefined();
    expect(client.getQueryData(local)).toBeUndefined();
    expect(client.getQueryData(elsewhere)).toEqual({ requests: [] });
  } finally {
    cache.dispose();
    client.clear();
  }
});

test("conversation hints refresh root and reply targets without crossing conversation or workspace boundaries", async () => {
  const client = new QueryClient();
  const scopes = [
    ["org", "viewed", "root"],
    ["org", "viewed", "reply"],
    ["org", "other", "root"],
    ["foreign", "viewed", "root"],
  ] as const;
  const reads = [0, 0, 0, 0];
  const observers = scopes.map(([org, conversation, message], index) => {
    const read = async () => {
      reads[index]++;
      return "fresh";
    };
    return new QueryObserver(client, {
      queryKey: [...queryKeys.messageTargets(org, conversation), message],
      initialData: "old",
      staleTime: Infinity,
      queryFn: () => read(),
    });
  });
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    await cache.receive({ ...change("messaging", "foreign"), conversationId: "viewed" });
    await Bun.sleep(25);
    expect(reads).toEqual([0, 0, 0, 0]);
    await cache.receive({ ...change("messaging"), conversationId: "viewed" });
    await Bun.sleep(25);
    expect(observers.map((observer) => observer.getCurrentResult().data)).toEqual([
      "fresh",
      "fresh",
      "old",
      "old",
    ]);
    expect(reads).toEqual([1, 1, 0, 0]);
    await cache.receive(change("messaging"));
    await Bun.sleep(25);
    expect(reads).toEqual([2, 2, 1, 0]);
  } finally {
    cache.dispose();
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    client.clear();
  }
});

test("conversation hints refresh only matching mounted context pages, with a broad unhinted fallback", async () => {
  const client = new QueryClient();
  const reads = [0, 0];
  const observers = ["viewed", "other"].map((id, index) => {
    const read = async () => {
      reads[index]++;
      return ["fresh"];
    };
    return new QueryObserver(client, {
      queryKey: [...queryKeys.context("org"), "message-pages", id, [id]],
      initialData: ["old"],
      staleTime: Infinity,
      queryFn: () => read(),
    });
  });
  const unsubscribes = observers.map((observer) => observer.subscribe(() => {}));
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    await cache.receive({ ...change("messaging"), conversationId: "other" });
    await Bun.sleep(25);
    expect(reads).toEqual([0, 1]);
    expect(observers[0]!.getCurrentResult().data).toEqual(["old"]);
    await cache.receive({ ...change("messaging"), conversationId: "viewed" });
    await Bun.sleep(25);
    expect(reads).toEqual([1, 1]);
    expect(observers[0]!.getCurrentResult().data).toEqual(["fresh"]);
    await cache.receive(change("messaging"));
    await Bun.sleep(25);
    expect(reads).toEqual([2, 2]);
  } finally {
    cache.dispose();
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    client.clear();
  }
});

test("task activity and related context refresh while task/message search becomes stale without a refetch storm", async () => {
  for (const domain of ["tasks", "messaging", "context"] as const) {
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
      batchMs: 5,
    });
    await cache.receive(change(domain));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(client.getQueryState(keys.activity)?.isInvalidated).toBe(domain !== "messaging");
    expect(client.getQueryState(keys.related)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.search)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys.pages)?.isInvalidated).toBe(true);
    // Only task titles appear in existing notifications; new ones send their own hint.
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
  const harnessKey = queryKeys.localAgentConfiguration("user", "org", "agent", "local");
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

test("context changes refetch known context families only, leaving notifications fresh and both search families stale", async () => {
  const client = new QueryClient();
  const context = queryKeys.context("org");
  const keys = [
    ...["activity", "related", "message-pages", "target"].map((kind) => [
      ...context,
      kind,
      "record",
    ]),
    [...context, "notifications"],
    [...context, "search", "term"],
    [...context, "search-pages", "term"],
    [...context, "unknown"],
    [...context, "notifications", "page", "unread", "cursor"],
    [...queryKeys.context("other"), "related", "record"],
    queryKeys.projects("org"),
    queryKeys.conversations("org"),
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
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    await client.invalidateQueries({ queryKey: context });
    expect(reads.reduce((sum, count) => sum + count, 0)).toBe(9);
    reads.fill(0);
    await cache.receive(change("context"));
    await Bun.sleep(25);
    expect(reads).toEqual([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(client.getQueryState(keys[5]!)?.isInvalidated).toBe(true);
    expect(client.getQueryState(keys[6]!)?.isInvalidated).toBe(true);
  } finally {
    cache.dispose();
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    client.clear();
  }
});

test("task edits refresh titles shown by message links and existing notifications, not pages without links", async () => {
  const client = new QueryClient();
  const linked = [...queryKeys.context("org"), "message-pages", "conversation", ["message"]];
  const plain = [...queryKeys.context("org"), "message-pages", "conversation", ["plain"]];
  const notifications = [...queryKeys.context("org"), "notifications"];
  client.setQueryData(linked, [{ links: [{ entityId: "task", title: "Old task title" }] }]);
  client.setQueryData(plain, [{ links: [] }]);
  client.setQueryData(notifications, [{ title: "Old task title" }]);
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  await cache.receive(change("tasks"));
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(client.getQueryState(linked)?.isInvalidated).toBe(true);
  expect(client.getQueryState(notifications)?.isInvalidated).toBe(true);
  expect(client.getQueryState(plain)?.isInvalidated).toBe(false);
  // Reference changes can add links, so they still refresh every page.
  await cache.receive(change("context"));
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(client.getQueryState(plain)?.isInvalidated).toBe(true);
  cache.dispose();
  client.clear();
});

test("a task hint refreshes one mounted fifty-message context page, and access resets erase it", async () => {
  const client = new QueryClient();
  const key = [
    ...queryKeys.context("org"),
    "message-pages",
    "conversation",
    Array.from({ length: 50 }, (_, i) => `message-${i}`),
  ];
  let reads = 0;
  let title = "Old work title";
  const read = async () => {
    reads++;
    return Array.from({ length: 50 }, () => ({ links: [{ entityId: "task", title }] }));
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    retry: false,
    queryFn: () => read(),
  });
  const unsubscribe = observer.subscribe(() => {});
  await observer.refetch();
  expect(reads).toBe(1);
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    title = "Updated work title";
    await cache.receive(change("tasks"));
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(reads).toBe(2);
    expect(client.getQueryData(key)).toEqual(
      Array.from({ length: 50 }, () => ({ links: [{ entityId: "task", title }] })),
    );
    const blocked = Promise.withResolvers<{ links: { entityId: string; title: string }[] }[]>();
    observer.setOptions({ ...observer.options, queryFn: () => blocked.promise });
    const reset = cache.receive(change("access"));
    expect(observer.getCurrentResult().data).toBeUndefined();
    blocked.resolve([]);
    await reset;
    expect(observer.getCurrentResult().data).toEqual([]);
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
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
    batchMs: 5,
  });
  const event = change("tasks");
  await cache.receive(event);
  await cache.receive(event);
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  client.setQueryData(key, ["new"]);
  await cache.receive(event);
  await new Promise((resolve) => setTimeout(resolve, 25));
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
  const read = async () => {
    const value = snapshot;
    if (++reads === 1) await first.promise;
    return value;
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    initialData: 0,
    staleTime: Infinity,
    queryFn: () => read(),
  });
  const unsubscribe = observer.subscribe(() => {});
  const threadKey = queryKeys.messages("org", "conversation", "thread");
  let threadReads = 0;
  const readThread = async () => {
    threadReads++;
    return snapshot;
  };
  const threadObserver = new QueryObserver(client, {
    queryKey: threadKey,
    initialData: 0,
    staleTime: Infinity,
    queryFn: () => readThread(),
  });
  const unsubscribeThread = threadObserver.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    batchMs: 5,
  });
  try {
    snapshot++;
    await cache.receive(change("messaging"));
    await new Promise((resolve) => setTimeout(resolve, 25));
    for (let index = 0; index < 4; index++) {
      snapshot++;
      await cache.receive(change("messaging"));
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    first.resolve();
    await new Promise((resolve) => setTimeout(resolve, 25));
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

for (const scenario of ["after", "settled", "before", "none"] as const) {
  test(`an own mutation's realtime echo reuses a read started after the event (${scenario})`, async () => {
    const client = new QueryClient();
    const key = queryKeys.conversations("org");
    const blocked = Promise.withResolvers<void>();
    let reads = 0;
    const read = async () => {
      reads++;
      if (scenario !== "settled") await blocked.promise;
      return "fresh";
    };
    const observer = new QueryObserver(client, {
      queryKey: key,
      initialData: "old",
      staleTime: Infinity,
      queryFn: () => read(),
    });
    const unsubscribe = observer.subscribe(() => {});
    const cache = createRealtimeCache({
      queryClient: client,
      organizationId: "org",
      userId: "user",
      revalidate: async () => {},
      batchMs: 5,
    });
    // The local mutation invalidation starts a read before or after its realtime echo arrives.
    const localRead = () => void client.invalidateQueries({ queryKey: key });
    try {
      if (scenario === "before") localRead();
      await cache.receive(change("messaging"));
      if (scenario === "after" || scenario === "settled") localRead();
      await Bun.sleep(25);
      blocked.resolve();
      await Bun.sleep(20);
      expect(reads).toBe(scenario === "before" ? 2 : 1);
      expect(client.getQueryData(key)).toBe("fresh");
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    } finally {
      blocked.resolve();
      cache.dispose();
      unsubscribe();
      client.clear();
    }
  });
}
