import { realtimeKeys } from "@substrate/contracts/realtime";
import type { ReceiverIdentity } from "@substrate/database/realtime";

import { createRealtimeAuthenticator } from "../../auth/realtime-session";
import { createRealtimeHub } from "./hub";
import type { Transport } from "./hub";
import { coalesceReceivers } from "./receivers";
import { testReceiver } from "./test-support";
import { expect, test } from "bun:test";

const resolved = (identity: ReceiverIdentity) =>
  identity.userId.startsWith("denied")
    ? null
    : testReceiver({
        ...identity,
        actorId: identity.organizationId && `${identity.userId}-actor`,
      });

test("concurrent lookups share one batch and each receives its own result", async () => {
  const batches: ReceiverIdentity[][] = [];
  const resolve = coalesceReceivers(async (identities) => {
    batches.push(identities.map((identity) => ({ ...identity })));
    return identities.map(resolved);
  });
  const identities = [
    { userId: "a", organizationId: "org" },
    { userId: "denied", organizationId: "org" },
    { userId: "a", organizationId: null },
    { userId: "a", organizationId: "other" },
  ];
  expect(await Promise.all(identities.map(resolve))).toEqual(identities.map(resolved));
  expect(batches).toEqual([identities]);
  // A later lookup starts a new batch and never reuses an earlier result.
  expect(await resolve(identities[0]!)).toEqual(resolved(identities[0]!));
  expect(batches).toHaveLength(2);
});

test("a failed or malformed batch rejects every lookup in it, and later batches recover", async () => {
  let mode: "fail" | "short" | "ok" = "fail";
  const resolve = coalesceReceivers(async (identities) => {
    if (mode === "fail") throw new Error("database unavailable");
    if (mode === "short") return identities.slice(1).map(resolved);
    return identities.map(resolved);
  });
  const identities = [
    { userId: "a", organizationId: "org" },
    { userId: "b", organizationId: "org" },
  ];
  for (const next of ["fail", "short"] as const) {
    mode = next;
    const results = await Promise.allSettled(identities.map(resolve));
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
  }
  mode = "ok";
  expect(await Promise.all(identities.map(resolve))).toEqual(identities.map(resolved));
});

test("batches split at the size limit", async () => {
  const sizes: number[] = [];
  const resolve = coalesceReceivers(async (identities) => {
    sizes.push(identities.length);
    return identities.map(resolved);
  }, 3);
  const identities = Array.from({ length: 7 }, (_, index) => ({
    userId: `user-${index}`,
    organizationId: "org",
  }));
  expect(await Promise.all(identities.map(resolve))).toEqual(identities.map(resolved));
  expect(sizes).toEqual([3, 3, 1]);
});

test("an access hint rechecks every connection in one receiver batch and removes revoked ones", async () => {
  const revoked = new Set<string>();
  let failing = false;
  const batches: ReceiverIdentity[][] = [];
  const authenticate = createRealtimeAuthenticator(
    {
      getSession: async ({ headers }) => {
        const [userId, organizationId] = headers.get("cookie")!.split(":");
        return {
          user: { id: userId, emailVerified: true },
          session: { activeOrganizationId: organizationId },
        };
      },
    },
    coalesceReceivers(async (identities) => {
      batches.push(identities);
      if (failing) throw new Error("database unavailable");
      return identities.map((identity) =>
        revoked.has(identity.userId) ? null : resolved(identity),
      );
    }),
  );
  const hub = createRealtimeHub({
    authenticate,
    recipients: async () => () => true,
    reportFailure: () => {},
  });
  const users = ["a", "b", "c", "d"];
  const connections = [];
  for (const userId of users) {
    const connection = await hub.reserve(new Headers({ cookie: `${userId}:org` }), "org");
    const events: unknown[] = [];
    const closed: number[] = [];
    const transport: Transport = {
      send: (data) => {
        events.push(JSON.parse(data));
        return data.length;
      },
      close: (code) => {
        closed.push(code);
      },
      terminate: () => {},
      ping: () => {},
      bufferedAmount: () => 0,
    };
    await hub.open(connection!, transport);
    connections.push({ events, closed });
  }
  batches.length = 0;
  revoked.add("b");
  await hub.publish({
    id: crypto.randomUUID(),
    audience: realtimeKeys.organization("org"),
    domain: "access",
  });
  expect(batches).toHaveLength(1);
  expect(batches[0]!.map((identity) => identity.userId).sort()).toEqual(users);
  expect(connections.map(({ events }) => events.length)).toEqual([2, 1, 2, 2]);
  expect(connections[1]!.closed).toEqual([1008]);
  expect(hub.size).toBe(3);
  // A failed batch closes each connection that waited on it.
  failing = true;
  await hub.publish({
    id: crypto.randomUUID(),
    audience: realtimeKeys.organization("org"),
    domain: "access",
  });
  expect(hub.size).toBe(0);
  expect(connections.map(({ events }) => events.length)).toEqual([2, 1, 2, 2]);
  hub.stop();
});
