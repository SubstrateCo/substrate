import { advanceTimersAsync } from "@substrate/contracts/testing/timers";

import { QueryClient } from "@tanstack/react-query";

import { queryKeys } from "../keys";
import { createRealtimeCache } from "./cache";
import { afterEach, beforeEach, expect, vi, test } from "bun:test";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("forbidden without an access event evicts private workspace, session, and account data before routing", async () => {
  const client = new QueryClient();
  const privateKey = queryKeys.projects("removed");
  const otherKey = queryKeys.projects("other");
  const agents = queryKeys.agents("user");
  client.setQueryData(privateKey, ["secret"]);
  client.setQueryData(otherKey, ["other"]);
  client.setQueryData(agents, ["agent"]);
  client.setQueryData(queryKeys.session, { user: "user" });
  let routed = false;
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "removed",
    userId: "user",
    revalidate: async () => {
      expect(client.getQueryData(privateKey)).toBeUndefined();
      expect(client.getQueryData(agents)).toBeUndefined();
      expect(client.getQueryData(queryKeys.session)).toBeUndefined();
      routed = true;
    },
  });
  await cache.forbidden();
  expect(routed).toBe(true);
  expect(client.getQueryData(otherKey)).toEqual(["other"]);
  cache.dispose();
  client.clear();
});

test("disposed generation cannot invalidate or route for delayed events", async () => {
  const client = new QueryClient();
  const key = queryKeys.projects("org");
  client.setQueryData(key, ["existing"]);
  let routed = false;
  const cache = createRealtimeCache({
    queryClient: client,
    organizationId: "org",
    userId: "user",
    revalidate: async () => {
      routed = true;
    },
  });
  await cache.receive({
    version: 1,
    type: "change",
    id: crypto.randomUUID(),
    organizationId: "org",
    domain: "tasks",
  });
  cache.dispose();
  await cache.receive({ version: 1, type: "ready" });
  await advanceTimersAsync(80);
  expect(client.getQueryState(key)?.isInvalidated).toBe(false);
  expect(routed).toBe(false);
  client.clear();
});
