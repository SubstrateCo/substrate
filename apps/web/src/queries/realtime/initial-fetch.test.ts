import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { expect, test } from "bun:test";

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
    const observer = new QueryObserver(client, {
      queryKey: key,
      retry: false,
      queryFn: ({ signal }) => {
        reads++;
        if (reads === 1) {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
          return initial.promise;
        }
        return Promise.resolve(["current project"]);
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
      await new Promise((resolve) => setTimeout(resolve, 80));
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
    const observer = new QueryObserver(client, {
      queryKey: key,
      staleTime: Infinity,
      queryFn: () => {
        reads++;
        return initial.promise;
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
      const received = cache.receive({
        version: 1,
        type: "change",
        domain,
        organizationId: "org",
        id: crypto.randomUUID(),
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
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
  const observer = new QueryObserver(client, {
    queryKey: key,
    initialData: ["loaded project"],
    staleTime: Infinity,
    queryFn: () => replacement.promise,
  });
  const unsubscribe = observer.subscribe(() => {});
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    await cache.receive({
      version: 1,
      type: "change",
      domain: "tasks",
      organizationId: "org",
      id: crypto.randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
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
  const observer = new QueryObserver(client, {
    queryKey: queryKeys.projects("org"),
    queryFn: ({ signal }) => {
      signal.throwIfAborted();
      reads++;
      return initial.promise;
    },
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
  const observer = new QueryObserver(client, {
    queryKey: key,
    initialData: { replyCount: 0 },
    staleTime: Infinity,
    queryFn: async () => {
      reads++;
      return { replyCount: 1 };
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
    await cache.receive({
      version: 1,
      type: "change",
      domain: "messaging",
      organizationId: "org",
      conversationId: "conversation",
      id: crypto.randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(reads).toBe(1);
    expect(client.getQueryData(key)).toEqual({ replyCount: 1 });
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});
