import { realtimeKeys } from "@startup-os/contracts/realtime";
import type { RealtimeEvent } from "@startup-os/contracts/realtime";
import type { RealtimeReceiver } from "@startup-os/database/realtime";

import { createRealtimeHub } from "./hub";
import type { Change, HubDependencies, Transport } from "./hub";
/* oxlint-disable typescript/await-thenable -- Bun's rejection matchers return promises at runtime. */
import { expect, test } from "bun:test";

function fixture(options: Parameters<typeof createRealtimeHub>[1] = {}) {
  const sessions = new Map<string, RealtimeReceiver>();
  let failures = 0;
  const deps: HubDependencies = {
    authenticate: async (headers, organizationId) => {
      const identity = sessions.get(headers.get("cookie") ?? "");
      return identity?.organizationId === organizationId ? identity : null;
    },
    canReceive: async () => true,
    reportFailure: () => {
      failures++;
    },
  };
  const hub = createRealtimeHub(deps, options);
  async function connect(userId = "user", organizationId: string | null = "org") {
    const cookie = `${userId}-${organizationId}`;
    sessions.set(cookie, { userId, organizationId, actorId: organizationId && `${userId}-actor` });
    const connection = await hub.reserve(new Headers({ cookie }), organizationId);
    if (!connection) throw new Error("Reservation rejected");
    const events: RealtimeEvent[] = [];
    const closed: number[] = [];
    let buffered = 0;
    let terminated = false;
    let pings = 0;
    const transport: Transport = {
      send: (data) => {
        events.push(JSON.parse(data));
        return data.length;
      },
      close: (code) => {
        closed.push(code);
      },
      terminate: () => {
        terminated = true;
      },
      ping: () => {
        pings++;
      },
      bufferedAmount: () => buffered,
    };
    await hub.open(connection, transport);
    return {
      connection,
      cookie,
      events,
      closed,
      transport,
      backlog(bytes: number) {
        buffered = bytes;
      },
      get terminated() {
        return terminated;
      },
      get pings() {
        return pings;
      },
    };
  }
  const publish = (audience: Change["audience"], domain: Change["domain"] = "messaging") =>
    hub.publish({ id: crypto.randomUUID(), audience, domain });
  return {
    hub,
    deps,
    sessions,
    connect,
    publish,
    get failures() {
      return failures;
    },
  };
}

test("routes server-owned audiences and authorizes each viewer in their own workspace", async () => {
  const f = fixture();
  const owner = await f.connect("owner", "org-a");
  const guest = await f.connect("guest", "org-b");
  const denied = await f.connect("denied", "org-b");
  const account = await f.connect("guest", null);
  f.deps.canReceive = async (identity, audience) => {
    if (audience[0] === "conversation") return identity.userId !== "denied";
    if (audience[0] === "actor") return identity.userId === "owner";
    return true;
  };
  await f.publish(realtimeKeys.organization("org-a"), "tasks");
  await f.publish(realtimeKeys.conversation("shared"));
  await f.publish(realtimeKeys.actor("org-a", "owner-actor"), "notifications");
  await f.publish(realtimeKeys.user("guest"), "profile");
  expect(owner.events.slice(1)).toMatchObject([
    { domain: "tasks", organizationId: "org-a" },
    { domain: "messaging", organizationId: "org-a", conversationId: "shared" },
    { domain: "notifications", organizationId: "org-a" },
  ]);
  expect(guest.events.slice(1)).toMatchObject([
    { domain: "messaging", organizationId: "org-b", conversationId: "shared" },
    { domain: "profile", organizationId: "org-b" },
  ]);
  expect(denied.events).toEqual([{ version: 1, type: "ready" }]);
  expect(account.events.slice(1)).toMatchObject([{ domain: "profile", organizationId: null }]);
  f.hub.stop();
});

test("revocation and workspace drift block delivery between heartbeats", async () => {
  const f = fixture();
  const revoked = await f.connect("revoked");
  const moved = await f.connect("moved");
  const recreated = await f.connect("recreated");
  f.sessions.delete(revoked.cookie);
  f.sessions.set(moved.cookie, {
    userId: "moved",
    organizationId: "other",
    actorId: "moved-actor",
  });
  // A replaced workspace actor must not inherit the old connection's actor audience.
  f.sessions.set(recreated.cookie, {
    userId: "recreated",
    organizationId: "org",
    actorId: "replacement-actor",
  });
  await f.publish(realtimeKeys.organization("org"));
  for (const peer of [revoked, moved, recreated]) {
    expect(peer.events).toEqual([{ version: 1, type: "ready" }]);
    expect(peer.closed).toEqual([1008]);
  }
  expect(f.hub.size).toBe(0);
});

test("heartbeat rechecks idle sessions and terminates peers that do not pong", async () => {
  const f = fixture({ heartbeatMs: 10 });
  const dead = await f.connect("dead");
  const revoked = await f.connect("revoked");
  const live = await f.connect("live");
  await f.hub.tick(1);
  f.hub.pong(live.connection);
  f.hub.pong(revoked.connection);
  f.sessions.delete(revoked.cookie);
  await f.hub.tick(11);
  expect(dead.terminated).toBe(true);
  expect(dead.closed).toEqual([1001]);
  expect(revoked.closed).toEqual([1008]);
  expect(live.closed).toEqual([]);
  expect(live.pings).toBe(2);
  f.hub.stop();
});

test("bounds reservations and expires abandoned upgrades", async () => {
  const f = fixture({ maxConnections: 2, maxPerUser: 1 });
  const live = await f.connect();
  await expect(f.hub.reserve(new Headers({ cookie: live.cookie }), "org")).rejects.toThrow(
    "Realtime capacity reached",
  );
  f.sessions.set("pending", { userId: "pending", organizationId: null, actorId: null });
  const pending = await f.hub.reserve(new Headers({ cookie: "pending" }), null);
  expect(pending).not.toBeNull();
  const atCapacity = f.hub.reserve(new Headers({ cookie: "pending" }), null);
  await expect(atCapacity).rejects.toThrow("Realtime capacity reached");
  await f.hub.tick(Date.now() + 20_000);
  expect(f.hub.size).toBe(1);
  const recovered = await f.hub.reserve(new Headers({ cookie: "pending" }), null);
  expect(recovered).not.toBeNull();
  f.hub.stop();
});

test("disconnects slow peers and rejects client subscriptions without retaining work", async () => {
  const f = fixture({ maxBufferedBytes: 16 });
  const slow = await f.connect("slow");
  const client = await f.connect("client");
  slow.backlog(17);
  f.hub.unexpectedMessage(client.connection);
  await f.publish(realtimeKeys.organization("org"));
  expect(slow.events).toEqual([{ version: 1, type: "ready" }]);
  expect(slow.closed).toEqual([1013]);
  expect(client.closed).toEqual([1008]);
  expect(f.hub.size).toBe(0);
});

test("authorization failures require resync instead of replaying the hint", async () => {
  const f = fixture();
  const viewer = await f.connect();
  f.deps.canReceive = async () => {
    throw new Error("database unavailable");
  };
  await f.publish(realtimeKeys.conversation("private"));
  expect(f.failures).toBe(1);
  expect(viewer.events).toHaveLength(1);
  expect(viewer.closed).toEqual([1012]);
  expect(f.hub.size).toBe(0);
});

test("subscription loss disconnects clients and blocks upgrades until fan-out recovers", async () => {
  const f = fixture();
  const viewer = await f.connect();
  f.hub.setAvailable(false);
  expect(viewer.closed).toEqual([1012]);
  await expect(f.hub.reserve(new Headers({ cookie: viewer.cookie }), "org")).rejects.toThrow(
    "Realtime capacity reached",
  );
  f.hub.setAvailable(true);
  const replacement = await f.connect();
  expect(replacement.events).toEqual([{ version: 1, type: "ready" }]);
  f.hub.stop();
});

test("shutdown while authorization is pending prevents a late delivery", async () => {
  const f = fixture();
  const viewer = await f.connect();
  const gate = Promise.withResolvers<boolean>();
  f.deps.canReceive = () => gate.promise;
  const pending = f.publish(realtimeKeys.user("user"));
  await Bun.sleep(0);
  f.hub.stop();
  gate.resolve(true);
  await pending;
  expect(viewer.events).toEqual([{ version: 1, type: "ready" }]);
  expect(viewer.terminated).toBe(true);
  await expect(f.hub.reserve(new Headers({ cookie: viewer.cookie }), "org")).rejects.toThrow(
    "Realtime capacity reached",
  );
});
