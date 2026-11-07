import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { expect, test } from "bun:test";

for (const trigger of ["ready", "profile", "session"] as const) {
  test(`${trigger} preserves a route promise shared with a cached header observer`, async () => {
    const client = new QueryClient();
    const initial = Promise.withResolvers<string[]>();
    let reads = 0;
    let aborted = false;
    const opts = {
      queryKey: queryKeys.session,
      staleTime: Infinity,
      retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) => {
        reads++;
        if (reads === 1)
          signal.addEventListener("abort", () => {
            aborted = true;
          });
        return reads === 1 ? initial.promise : Promise.resolve(["current session"]);
      },
    };
    client.setQueryData(queryKeys.session, ["cached session"]);
    const observer = new QueryObserver(client, opts);
    const unsubscribe = observer.subscribe(() => {});
    expect(reads).toBe(0);
    const routeLoad = client.query({ ...opts, staleTime: 0 });
    const outcome = routeLoad.then(
      (data) => ({ status: "resolved", data }),
      (error: Error) => ({ status: "rejected", error }),
    );
    const cache = createRealtimeCache({
      queryClient: client,
      organizationId: "org",
      userId: "user",
      revalidate: async () => {},
    });
    try {
      expect(reads).toBe(1);
      const resync = cache.receive(
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
      initial.resolve(["original session"]);
      expect(await outcome).toEqual({ status: "resolved", data: ["original session"] });
      expect(aborted).toBe(false);
      await resync;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(reads).toBe(2);
      expect(client.getQueryData(queryKeys.session)).toEqual(["current session"]);
      expect(observer.getCurrentResult().fetchStatus).toBe("idle");
    } finally {
      initial.resolve([]);
      cache.dispose();
      unsubscribe();
      client.clear();
    }
  });
}

for (const trigger of ["ready", "organization"] as const) {
  test(`${trigger} refreshes an unobserved route load without rejecting its original promise`, async () => {
    const client = new QueryClient();
    const key = trigger === "ready" ? queryKeys.session : queryKeys.organizationDetail("org");
    const initial = Promise.withResolvers<string[]>();
    let reads = 0;
    const opts = {
      queryKey: key,
      staleTime: Infinity,
      retry: false,
      queryFn: () => {
        reads++;
        return reads === 1 ? initial.promise : Promise.resolve(["current"]);
      },
    };
    const routeLoad = client.query(opts);
    const outcome = routeLoad.then(
      (data) => ({ status: "resolved", data }),
      (error: Error) => ({ status: "rejected", error }),
    );
    let routed = 0;
    const cache = createRealtimeCache({
      queryClient: client,
      organizationId: "org",
      userId: "user",
      revalidate: async () => {
        routed++;
      },
    });
    try {
      expect(client.getQueryCache().find({ queryKey: key })?.getObserversCount()).toBe(0);
      const resync = cache.receive(
        trigger === "ready"
          ? { version: 1, type: "ready" }
          : {
              version: 1,
              type: "change",
              domain: "organization",
              organizationId: "org",
              id: crypto.randomUUID(),
            },
      );
      await new Promise((resolve) => setTimeout(resolve, 80));
      initial.resolve(["original snapshot"]);
      expect(await outcome).toEqual({ status: "resolved", data: ["original snapshot"] });
      await resync;
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(reads).toBe(2);
      expect(client.getQueryData(key)).toEqual(["current"]);
      expect(client.getQueryState(key)?.fetchStatus).toBe("idle");
      expect(routed).toBe(1);
    } finally {
      initial.resolve([]);
      cache.dispose();
      client.clear();
    }
  });
}

test("a late unobserved loader cannot refresh or revalidate a disposed generation", async () => {
  const client = new QueryClient();
  const initial = Promise.withResolvers<string[]>();
  let reads = 0;
  let routed = false;
  const routeLoad = client.query({
    queryKey: queryKeys.organizations,
    retry: false,
    queryFn: () => {
      reads++;
      return initial.promise;
    },
  });
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    cache.dispose();
    initial.resolve(["original snapshot"]);
    expect(await routeLoad).toEqual(["original snapshot"]);
    await resync;
    expect(reads).toBe(1);
    expect(routed).toBe(false);
  } finally {
    initial.resolve([]);
    cache.dispose();
    client.clear();
  }
});

test("refresh preserves genuine loader failure rather than hiding it", async () => {
  const client = new QueryClient();
  const initial = Promise.withResolvers<string[]>();
  const failure = new Error("Session request failed");
  const routeLoad = client.query({
    queryKey: queryKeys.session,
    retry: false,
    queryFn: () => initial.promise,
  });
  const outcome = routeLoad.catch((error: Error) => error);
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {},
  });
  try {
    const resync = cache.receive({ version: 1, type: "ready" }).catch((error: Error) => error);
    await new Promise((resolve) => setTimeout(resolve, 0));
    initial.reject(failure);
    expect(await outcome).toBe(failure);
    expect(await resync).toBe(failure);
  } finally {
    cache.dispose();
    client.clear();
  }
});
