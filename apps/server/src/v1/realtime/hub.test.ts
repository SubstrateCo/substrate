import { realtimeEvent, realtimeKeys } from "@substrate/contracts/realtime";
import type { RealtimeEvent } from "@substrate/contracts/realtime";
import type { RealtimeReceiver } from "@substrate/database/realtime";

import { createRealtimeHub } from "./hub";
import type { Change, HubDependencies, Transport } from "./hub";
import { testReceiver } from "./test-support";
/* oxlint-disable typescript/await-thenable -- Bun's rejection matchers return promises at runtime. */
import { expect, test } from "bun:test";

function fixture(options: Parameters<typeof createRealtimeHub>[1] = {}) {
  const sessions = new Map<string, RealtimeReceiver>();
  let failures = 0;
  let checks = 0;
  const deps: HubDependencies = {
    authenticate: async (headers, organizationId) => {
      checks++;
      const identity = sessions.get(headers.get("cookie") ?? "");
      return identity?.organizationId === organizationId ? identity : null;
    },
    recipients: async () => () => true,
    reportFailure: () => {
      failures++;
    },
  };
  const hub = createRealtimeHub(deps, options);
  async function connect(userId = "user", organizationId: string | null = "org") {
    const cookie = `${userId}-${organizationId}`;
    sessions.set(
      cookie,
      testReceiver({ userId, organizationId, actorId: organizationId && `${userId}-actor` }),
    );
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
    get checks() {
      return checks;
    },
  };
}

test("routes server-owned audiences and authorizes each viewer in their own workspace", async () => {
  const f = fixture();
  const owner = await f.connect("owner", "org-a");
  const guest = await f.connect("guest", "org-b");
  const denied = await f.connect("denied", "org-b");
  const account = await f.connect("guest", null);
  f.deps.recipients = async (audience) => (identity) => {
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

test("changes forward their record identifiers, which the client contract accepts", async () => {
  const f = fixture();
  const viewer = await f.connect();
  await f.hub.publish({
    id: crypto.randomUUID(),
    audience: realtimeKeys.conversation("conversation"),
    domain: "messaging",
    scope: "reactions",
    messageId: "message",
    threadId: null,
  });
  const [, event] = viewer.events;
  expect(realtimeEvent.parse(event)).toMatchObject({
    conversationId: "conversation",
    scope: "reactions",
    messageId: "message",
    threadId: null,
  });
  f.hub.stop();
});

function drift(f: ReturnType<typeof fixture>, peers: { cookie: string }[]) {
  const [revoked, moved, recreated] = peers;
  f.sessions.delete(revoked!.cookie);
  f.sessions.set(
    moved!.cookie,
    testReceiver({ userId: "moved", organizationId: "other", actorId: "moved-actor" }),
  );
  // A replaced workspace actor must not inherit the old connection's actor audience.
  f.sessions.set(
    recreated!.cookie,
    testReceiver({ userId: "recreated", organizationId: "org", actorId: "replacement-actor" }),
  );
}

test("revocation and workspace drift stop delivery by the next session check", async () => {
  const f = fixture();
  const peers = [
    await f.connect("revoked"),
    await f.connect("moved"),
    await f.connect("recreated"),
  ];
  // reserve() checks each session once; open() reuses that check.
  expect(f.checks).toBe(3);
  drift(f, peers);
  // A check stays valid until the next one is due, so ordinary hints skip the session lookup.
  await f.publish(realtimeKeys.organization("org"));
  expect(f.checks).toBe(3);
  for (const peer of peers) expect(peer.events).toHaveLength(2);
  await f.hub.tick(Date.now() + 60_000);
  await f.publish(realtimeKeys.organization("org"));
  for (const peer of peers) {
    expect(peer.events).toHaveLength(2);
    expect(peer.closed).toEqual([1008]);
  }
  expect(f.hub.size).toBe(0);
});

for (const domain of ["session", "access"] as const) {
  test(`${domain} hints recheck the session before delivery`, async () => {
    const f = fixture();
    const peers = [
      await f.connect("revoked"),
      await f.connect("moved"),
      await f.connect("recreated"),
    ];
    const live = await f.connect("live");
    drift(f, peers);
    await f.publish(realtimeKeys.organization("org"), domain);
    for (const peer of peers) {
      expect(peer.events).toEqual([{ version: 1, type: "ready" }]);
      expect(peer.closed).toEqual([1008]);
    }
    expect(live.events.slice(1)).toMatchObject([{ domain }]);
    expect(f.hub.size).toBe(1);
    f.hub.stop();
  });
}

test("a conversation change to fifty other-workspace connections resolves its audience once without session lookups", async () => {
  const f = fixture();
  let resolved = 0;
  f.deps.recipients = async () => {
    resolved++;
    return (identity) => identity.organizationId === "org";
  };
  const member = await f.connect("member", "org");
  const others = [];
  for (let index = 0; index < 50; index++)
    others.push(await f.connect(`other-${index}`, `o${index}`));
  const checks = f.checks;
  await f.publish(realtimeKeys.conversation("shared"));
  expect(resolved).toBe(1);
  expect(f.checks - checks).toBe(0);
  expect(member.events.slice(1)).toMatchObject([{ conversationId: "shared" }]);
  for (const other of others) expect(other.events).toHaveLength(1);
  f.hub.stop();
});

test("a change checks only the stale sessions of its recipients", async () => {
  const f = fixture({ sessionCheckMs: 1 });
  f.deps.recipients = async () => (identity) => identity.userId === "member";
  const member = await f.connect("member", "org");
  const others = [];
  for (let index = 0; index < 5; index++) others.push(await f.connect(`other-${index}`, "org"));
  await Bun.sleep(5);
  const checked: string[] = [];
  const authenticate = f.deps.authenticate.bind(f.deps);
  f.deps.authenticate = async (headers, organizationId) => {
    checked.push(headers.get("cookie") ?? "");
    return authenticate(headers, organizationId);
  };
  await f.publish(realtimeKeys.conversation("shared"));
  await f.publish(realtimeKeys.organization("org"), "access");
  expect(checked).toEqual([member.cookie, member.cookie]);
  expect(member.events.slice(1)).toMatchObject([
    { conversationId: "shared" },
    { domain: "access" },
  ]);
  for (const other of others) expect(other.events).toHaveLength(1);
  f.hub.stop();
});

test("a batch checks each stale session once, resolves each audience once and keeps event order", async () => {
  const f = fixture({ sessionCheckMs: 1 });
  let resolved = 0;
  f.deps.recipients = async () => {
    resolved++;
    return () => true;
  };
  const first = await f.connect("first");
  const second = await f.connect("second");
  await Bun.sleep(5);
  const checks = f.checks;
  const audience = realtimeKeys.organization("org");
  await f.hub.publish(
    { id: crypto.randomUUID(), audience, domain: "tasks" },
    { id: crypto.randomUUID(), audience, domain: "context" },
    { id: crypto.randomUUID(), audience: realtimeKeys.conversation("c"), domain: "messaging" },
  );
  expect(f.checks - checks).toBe(2);
  expect(resolved).toBe(2);
  for (const peer of [first, second])
    expect(peer.events.slice(1).map((event) => event.type === "change" && event.domain)).toEqual([
      "tasks",
      "context",
      "messaging",
    ]);
  f.hub.stop();
});

test("session checks during delivery run with bounded concurrency", async () => {
  const f = fixture({ sessionCheckMs: 1, maxConcurrentChecks: 2 });
  const peers = [];
  for (let index = 0; index < 6; index++) peers.push(await f.connect(`user-${index}`));
  await Bun.sleep(5);
  const authenticate = f.deps.authenticate.bind(f.deps);
  let active = 0;
  let peak = 0;
  f.deps.authenticate = async (headers, organizationId) => {
    peak = Math.max(peak, ++active);
    await Bun.sleep(1);
    active--;
    return authenticate(headers, organizationId);
  };
  await f.publish(realtimeKeys.organization("org"));
  expect(peak).toBe(2);
  for (const peer of peers) expect(peer.events).toHaveLength(2);
  f.hub.stop();
});

test("heartbeat pings without a session lookup until the session check is due", async () => {
  const f = fixture({ heartbeatMs: 10, sessionCheckMs: 30 });
  const live = await f.connect("live");
  const start = Date.now();
  const checks = f.checks;
  await f.hub.tick(start + 1);
  f.hub.pong(live.connection);
  await f.hub.tick(start + 12);
  f.hub.pong(live.connection);
  expect(f.checks - checks).toBe(0);
  await f.hub.tick(start + 31);
  expect(f.checks - checks).toBe(1);
  expect(live.pings).toBe(3);
  f.hub.stop();
});

test("heartbeat rechecks idle sessions and terminates peers that do not pong", async () => {
  const f = fixture({ heartbeatMs: 10, sessionCheckMs: 10 });
  const dead = await f.connect("dead");
  const revoked = await f.connect("revoked");
  const live = await f.connect("live");
  const start = Date.now();
  await f.hub.tick(start + 1);
  f.hub.pong(live.connection);
  f.hub.pong(revoked.connection);
  f.sessions.delete(revoked.cookie);
  await f.hub.tick(start + 11);
  expect(dead.terminated).toBe(true);
  expect(dead.closed).toEqual([1001]);
  expect(revoked.closed).toEqual([1008]);
  expect(live.closed).toEqual([]);
  expect(live.pings).toBe(2);
  f.hub.stop();
});

test("a slow heartbeat session check does not delay pings to other connections", async () => {
  const f = fixture({ sessionCheckMs: 1 });
  const slow = await f.connect("slow");
  const fast = await f.connect("fast");
  await Bun.sleep(5);
  const gate = Promise.withResolvers<void>();
  const authenticate = f.deps.authenticate.bind(f.deps);
  f.deps.authenticate = async (headers, organizationId) => {
    if (headers.get("cookie") === slow.cookie) await gate.promise;
    return authenticate(headers, organizationId);
  };
  const tick = f.hub.tick();
  await Bun.sleep(5);
  expect(fast.pings).toBe(1);
  expect(slow.pings).toBe(0);
  gate.resolve();
  await tick;
  expect(slow.pings).toBe(1);
  f.hub.stop();
});

test("bounds reservations and expires abandoned upgrades", async () => {
  const f = fixture({ maxConnections: 2, maxPerUser: 1 });
  const live = await f.connect();
  await expect(f.hub.reserve(new Headers({ cookie: live.cookie }), "org")).rejects.toThrow(
    "Realtime capacity reached",
  );
  f.sessions.set(
    "pending",
    testReceiver({ userId: "pending", organizationId: null, actorId: null }),
  );
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
  f.deps.recipients = async () => {
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
  f.deps.recipients = () => gate.promise.then((allowed) => () => allowed);
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
