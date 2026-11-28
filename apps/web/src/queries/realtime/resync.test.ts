import { advanceTimersAsync } from "@substrate/contracts/testing/timers";

import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { afterEach, beforeEach, expect, vi, test } from "bun:test";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("overlapping timer, focus and visibility reconciliations share one recovery read", async () => {
  const client = new QueryClient();
  const key = queryKeys.messages("org", "conversation");
  const response = Promise.withResolvers<string[]>();
  let reads = 0;
  let routes = 0;
  const read = () => {
    reads++;
    return response.promise;
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    initialData: ["visible"],
    staleTime: Infinity,
    queryFn: () => read(),
  });
  const stop = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {
      routes++;
    },
  });
  try {
    const pending = [cache.reconcile(), cache.reconcile(), cache.reconcile()];
    expect(observer.getCurrentResult().data).toEqual(["visible"]);
    response.resolve(["missed hint recovered"]);
    await Promise.all(pending);
    expect(reads).toBe(1);
    expect(routes).toBe(1);
    expect(observer.getCurrentResult().data).toEqual(["missed hint recovered"]);
  } finally {
    response.resolve([]);
    cache.dispose();
    stop();
    client.clear();
  }
});

test("reconciliation skips a full read soon after a fresh one, and reads again once it is old or failed", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let reads = 0;
  let fail = false;
  const read = async () => {
    reads++;
    if (fail) throw new Error("Unavailable");
    return ["visible"];
  };
  const observer = new QueryObserver(client, {
    queryKey: queryKeys.messages("org", "conversation"),
    initialData: ["visible"],
    staleTime: Infinity,
    queryFn: () => read(),
  });
  const stop = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
    reconcileEveryMs: 1000,
  });
  try {
    await cache.reconcile();
    expect(reads).toBe(1);
    await advanceTimersAsync(900);
    await cache.reconcile();
    expect(reads).toBe(1);
    await advanceTimersAsync(100);
    fail = true;
    await cache.reconcile();
    expect(reads).toBe(2);
    fail = false;
    await cache.reconcile();
    expect(reads).toBe(3);
  } finally {
    cache.dispose();
    stop();
    client.clear();
  }
});

test("reconciliation skips a full read soon after the socket's ready", async () => {
  const client = new QueryClient();
  let reads = 0;
  const read = async () => {
    reads++;
    return ["visible"];
  };
  const observer = new QueryObserver(client, {
    queryKey: queryKeys.messages("org", "conversation"),
    initialData: ["visible"],
    staleTime: Infinity,
    queryFn: () => read(),
  });
  const stop = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    await cache.receive({ version: 1, type: "ready" });
    await cache.reconcile();
    expect(reads).toBe(0);
  } finally {
    cache.dispose();
    stop();
    client.clear();
  }
});

test("resync reads each active query once", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const reads = new Map<string, number>();
  const observe = (name: string, queryKey: readonly unknown[]) => {
    const observer = new QueryObserver(client, {
      queryKey,
      staleTime: Infinity,
      queryFn: async () => {
        reads.set(name, (reads.get(name) ?? 0) + 1);
        return [name];
      },
    });
    return observer.subscribe(() => {});
  };
  const unsubscribe = [
    observe("messages", queryKeys.messages("org", "conversation")),
    observe("session", queryKeys.session),
    observe("release", ["desktop", "release"]),
  ];
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    await advanceTimersAsync(0);
    reads.clear();
    await cache.resync();
    expect(Object.fromEntries(reads)).toEqual({ messages: 1, session: 1, release: 1 });
  } finally {
    cache.dispose();
    for (const stop of unsubscribe) stop();
    client.clear();
  }
});

test("resync keeps content visible while it rechecks access, then removes it when denied", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = queryKeys.messages("org", "private");
  client.setQueryData(key, ["formerly visible"]);
  const denied = Promise.withResolvers<string[]>();
  const read = () => denied.promise;
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
  });
  try {
    const pending = cache.resync();
    expect(observer.getCurrentResult().data).toEqual(["formerly visible"]);
    expect(observer.getCurrentResult().fetchStatus).toBe("fetching");
    denied.reject(Object.assign(new Error("Access denied"), { status: 403 }));
    await pending;
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(client.getQueryData(key)).toBeUndefined();
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("reconciliation discovers a committed message without a change hint or reconnect", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = queryKeys.messages("org", "conversation");
  let stored = ["first"];
  const read = async () => stored;
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
  });
  try {
    await observer.refetch();
    stored = ["first", "committed without a hint"];
    await cache.reconcile();
    expect(observer.getCurrentResult().data).toEqual(stored);
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("reconciliation clears cached private content after a missed revocation", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = queryKeys.messages("org", "private");
  client.setQueryData(key, ["private message"]);
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    queryFn: async () => {
      throw Object.assign(new Error("Forbidden"), { status: 403 });
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    await cache.reconcile();
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(client.getQueryData(key)).toBeUndefined();
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("reconciliation reports failed reads and returns to fresh after recovery", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let available = false;
  const health: string[] = [];
  const key = queryKeys.messages("org", "conversation");
  client.setQueryData(key, ["last known message"]);
  const read = async () => {
    if (!available) throw new Error("Temporary outage");
    return ["recovered message"];
  };
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
    onHealth: (value) => health.push(value),
  });
  try {
    await cache.reconcile();
    expect(health.at(-1)).toBe("stale");
    expect(observer.getCurrentResult().data).toEqual(["last known message"]);
    available = true;
    await cache.reconcile();
    expect(health.at(-1)).toBe("fresh");
    expect(observer.getCurrentResult().data).toEqual(["recovered message"]);
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("background reconciliation keeps healthy messages visible while the read is pending", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = queryKeys.messages("org", "conversation");
  client.setQueryData(key, ["already visible"]);
  const updated = Promise.withResolvers<string[]>();
  const read = () => updated.promise;
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
  });
  try {
    const pending = cache.reconcile();
    expect(observer.getCurrentResult().data).toEqual(["already visible"]);
    updated.resolve(["already visible", "new message"]);
    await pending;
    expect(observer.getCurrentResult().data).toEqual(["already visible", "new message"]);
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("reconciliation clears revoked messages when a request already in flight fails", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = queryKeys.messages("org", "private");
  client.setQueryData(key, ["private message"]);
  const denied = Promise.withResolvers<string[]>();
  const read = () => denied.promise;
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
  });
  try {
    const fetching = observer.refetch();
    const pending = cache.reconcile();
    denied.reject(Object.assign(new Error("Forbidden"), { status: 403 }));
    let failure: unknown;
    try {
      await pending;
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ message: "Forbidden" });
    await fetching;
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(client.getQueryData(key)).toBeUndefined();
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("reconciliation keeps unmounted history cached but stale, so its next view reads it again", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const messages = queryKeys.messages("org", "revoked");
  const other = queryKeys.messages("other", "private");
  client.setQueryData(messages, ["formerly accessible"]);
  client.setQueryData(other, ["another workspace"]);
  const observer = new QueryObserver(client, {
    queryKey: queryKeys.conversations("org"),
    initialData: [{ id: "revoked" }],
    staleTime: Infinity,
    queryFn: async () => [],
  });
  const unsubscribe = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    await cache.reconcile();
    expect(observer.getCurrentResult().data).toEqual([]);
    expect(client.getQueryData(messages)).toEqual(["formerly accessible"]);
    expect(client.getQueryState(messages)?.isInvalidated).toBe(true);
    expect(client.getQueryData(other)).toEqual(["another workspace"]);
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});
