import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { expect, test } from "bun:test";

test("ready resync ignores a canceled page that has been replaced by another visible page", async () => {
  const client = new QueryClient();
  const oldPage = Promise.withResolvers<string[]>();
  const oldKey = [...queryKeys.context("org"), "notifications", "page", 20];
  const currentKey = [...queryKeys.context("org"), "notifications", "page", 5];
  const readOldPage = (signal: AbortSignal) => {
    signal.throwIfAborted();
    return oldPage.promise;
  };
  const oldObserver = new QueryObserver(client, {
    queryKey: oldKey,
    queryFn: ({ signal }) => readOldPage(signal),
  });
  const unsubscribeOld = oldObserver.subscribe(() => {});
  let routed = false;
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {
      routed = true;
    },
  });
  const ready = cache.receive({ version: 1, type: "ready" });
  const currentObserver = new QueryObserver(client, {
    queryKey: currentKey,
    queryFn: async () => ["current page"],
  });
  const unsubscribeCurrent = currentObserver.subscribe(() => {});
  unsubscribeOld();
  try {
    await ready;
    await client.query({ queryKey: currentKey, queryFn: async () => ["current page"] });
    expect(routed).toBe(true);
    expect(client.getQueryData(currentKey)).toEqual(["current page"]);
    expect(client.getQueryData(oldKey)).toBeUndefined();
  } finally {
    oldPage.resolve([]);
    cache.dispose();
    unsubscribeCurrent();
    client.clear();
  }
});

for (const trigger of ["tasks", "ready", "messaging"] as const) {
  test(`${trigger} preserves an in-flight initial snapshot then refreshes it`, async () => {
    const client = new QueryClient();
    const key =
      trigger === "messaging"
        ? queryKeys.messages("org", "conversation")
        : queryKeys.projects("org");
    const initial = Promise.withResolvers<string[]>();
    let reads = 0;
    let aborted = false;
    const read = (signal: AbortSignal) => {
      reads++;
      if (reads === 1) {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
        return initial.promise;
      }
      return Promise.resolve(["current project"]);
    };
    const observer = new QueryObserver(client, {
      queryKey: key,
      retry: false,
      queryFn: ({ signal }) => read(signal),
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
      expect(reads).toBe(1);
      const received = cache.receive(
        trigger === "ready"
          ? { version: 1, type: "ready" }
          : {
              version: 1,
              type: "change",
              domain: trigger,
              organizationId: "org",
              id: crypto.randomUUID(),
            },
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      initial.resolve(["obsolete project"]);
      await received;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(reads).toBe(2);
      expect(aborted).toBe(false);
      expect(client.getQueryData(key)).toEqual(["current project"]);
      expect(observer.getCurrentResult().status).toBe("success");
      expect(observer.getCurrentResult().fetchStatus).toBe("idle");
    } finally {
      initial.resolve(["obsolete project"]);
      cache.dispose();
      unsubscribe();
      client.clear();
    }
  });
}

for (const domain of ["messaging", "context"] as const) {
  test(`${domain} leaves an in-flight search snapshot loaded and stale without a second read`, async () => {
    const client = new QueryClient();
    const key = [...queryKeys.context("org"), "search", "term"];
    const initial = Promise.withResolvers<string[]>();
    let reads = 0;
    const read = () => {
      reads++;
      return initial.promise;
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
      batchMs: 5,
    });
    try {
      const received = cache.receive({
        version: 1,
        type: "change",
        domain,
        organizationId: "org",
        id: crypto.randomUUID(),
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
      initial.resolve(["retained result"]);
      await received;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(reads).toBe(1);
      expect(client.getQueryData(key)).toEqual(["retained result"]);
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
      expect(observer.getCurrentResult().fetchStatus).toBe("idle");
    } finally {
      initial.resolve([]);
      cache.dispose();
      unsubscribe();
      client.clear();
    }
  });
}

test("refresh retains loaded content until the replacement request completes", async () => {
  const client = new QueryClient();
  const key = queryKeys.projects("org");
  const replacement = Promise.withResolvers<string[]>();
  const read = () => replacement.promise;
  const observer = new QueryObserver(client, {
    queryKey: key,
    initialData: ["loaded project"],
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
    await cache.receive({
      version: 1,
      type: "change",
      domain: "tasks",
      organizationId: "org",
      id: crypto.randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(client.getQueryData(key)).toEqual(["loaded project"]);
    expect(observer.getCurrentResult().fetchStatus).toBe("fetching");
    replacement.resolve(["current project"]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getQueryData(key)).toEqual(["current project"]);
    expect(observer.getCurrentResult().fetchStatus).toBe("idle");
  } finally {
    replacement.resolve([]);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("disposed generation cancels private work and cannot restart it or revalidate its old route", async () => {
  const client = new QueryClient();
  const initial = Promise.withResolvers<string[]>();
  let reads = 0;
  let routed = false;
  const read = (signal: AbortSignal) => {
    signal.throwIfAborted();
    reads++;
    return initial.promise;
  };
  const observer = new QueryObserver(client, {
    queryKey: queryKeys.projects("org"),
    queryFn: ({ signal }) => read(signal),
  });
  const unsubscribe = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {
      routed = true;
    },
  });
  try {
    const resync = cache.receive({ version: 1, type: "ready" });
    cache.dispose();
    initial.resolve(["obsolete project"]);
    const outcome = await resync.catch((error: Error) => error);
    expect(outcome).toMatchObject({ message: "CancelledError" });
    expect(reads).toBe(1);
    expect(client.getQueryData(queryKeys.projects("org"))).toBeUndefined();
    expect(routed).toBe(false);
  } finally {
    initial.resolve([]);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("a plain thread reply refreshes related discussion counts without references", async () => {
  const client = new QueryClient();
  const key = [...queryKeys.context("org"), "related", "task"];
  let reads = 0;
  const read = async () => {
    reads++;
    return { replyCount: 1 };
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    initialData: { replyCount: 0 },
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
    await cache.receive({
      version: 1,
      type: "change",
      domain: "messaging",
      organizationId: "org",
      conversationId: "conversation",
      id: crypto.randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(reads).toBe(1);
    expect(client.getQueryData(key)).toEqual({ replyCount: 1 });
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("ready keeps harness reads that have not failed and retries failed ones", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const reads = { loaded: 0, failed: 0 };
  const loadedKey = queryKeys.harnessStatus("user", "org");
  const failedKey = queryKeys.harnessModels("user", "org", "codex");
  const readLoaded = async () => {
    reads.loaded++;
    return ["codex"];
  };
  const readFailed = async () => {
    reads.failed++;
    if (reads.failed === 1) throw new Error("Bridge unavailable");
    return ["model"];
  };
  const loaded = new QueryObserver(client, { queryKey: loadedKey, queryFn: () => readLoaded() });
  const failed = new QueryObserver(client, { queryKey: failedKey, queryFn: () => readFailed() });
  const unsubscribe = [loaded.subscribe(() => {}), failed.subscribe(() => {})];
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await cache.receive({ version: 1, type: "ready" });
    expect(reads).toEqual({ loaded: 1, failed: 2 });
    expect(client.getQueryData(failedKey)).toEqual(["model"]);
  } finally {
    cache.dispose();
    for (const stop of unsubscribe) stop();
    client.clear();
  }
});
