import { QueryClient, QueryObserver } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { expect, test } from "bun:test";

const access = () =>
  ({
    version: 1,
    type: "change",
    domain: "access",
    organizationId: "org",
    id: crypto.randomUUID(),
  }) as const;

test("forbidden resets preserve mounted observers for a later authorized ready resync", async () => {
  const client = new QueryClient();
  const key = queryKeys.projects("org");
  client.setQueryData(key, ["private project"]);
  let allowed = false;
  const read = async () => {
    if (!allowed) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return ["authorized project"];
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    retry: false,
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
    await cache.forbidden();
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(client.getQueryCache().find({ queryKey: key })?.getObserversCount()).toBe(1);
    allowed = true;
    await cache.receive({ version: 1, type: "ready" });
    expect(observer.getCurrentResult().data).toEqual(["authorized project"]);
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("access resets mounted queries without detaching the view, then clears revoked data", async () => {
  const client = new QueryClient();
  const key = queryKeys.projects("org");
  const inactive = queryKeys.project("org", "unmounted");
  client.setQueryData(key, ["old private project"]);
  client.setQueryData(inactive, "private detail");
  let allowed = true;
  const read = async () => {
    if (!allowed) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return ["newly granted project"];
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    retry: false,
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
    await cache.receive(access());
    expect(observer.getCurrentResult().data).toEqual(["newly granted project"]);
    expect(client.getQueryCache().find({ queryKey: key })?.getObserversCount()).toBe(1);
    expect(client.getQueryData(inactive)).toBeUndefined();
    allowed = false;
    await cache.receive(access());
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(observer.getCurrentResult().status).toBe("error");
    expect(client.getQueryData(key)).toBeUndefined();
  } finally {
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("a later revocation cancels a slow access reset and cannot be overwritten by its old grant", async () => {
  const client = new QueryClient();
  const key = queryKeys.projects("org");
  client.setQueryData(key, ["private project"]);
  const oldGrant = Promise.withResolvers<string[]>();
  let reads = 0;
  const read = () => {
    reads++;
    return reads === 1
      ? oldGrant.promise
      : Promise.reject(Object.assign(new Error("Forbidden"), { status: 403 }));
  };
  const observer = new QueryObserver(client, {
    queryKey: key,
    staleTime: Infinity,
    retry: false,
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
    const first = cache.receive(access());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reads).toBe(1);
    const second = cache.receive(access());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reads).toBe(2);
    expect(observer.getCurrentResult().data).toBeUndefined();
    oldGrant.resolve(["obsolete granted project"]);
    await Promise.all([first, second]);
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(observer.getCurrentResult().status).toBe("error");
    expect(observer.getCurrentResult().fetchStatus).toBe("idle");
  } finally {
    oldGrant.resolve([]);
    cache.dispose();
    unsubscribe();
    client.clear();
  }
});

test("an access event during route revalidation clears newly loaded private data and queues revalidation", async () => {
  const client = new QueryClient();
  const key = queryKeys.projects("org");
  client.setQueryData(key, ["private project"]);
  const route = Promise.withResolvers<void>();
  let routes = 0;
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {
      routes++;
      if (routes === 1) await route.promise;
    },
  });
  try {
    const first = cache.receive(access());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(routes).toBe(1);
    client.setQueryData(key, ["new private snapshot"]);
    const second = cache.receive(access());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.getQueryData(key)).toBeUndefined();
    route.resolve();
    await Promise.all([first, second]);
    expect(routes).toBe(2);
  } finally {
    route.resolve();
    cache.dispose();
    client.clear();
  }
});
