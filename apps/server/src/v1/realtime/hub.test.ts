import { realtimeKeys } from "@startup-os/contracts/realtime";
import type { RealtimeEvent } from "@startup-os/contracts/realtime";

import { createRealtimeHub } from "./hub";
import type { Change, HubDependencies, Identity, Transport } from "./hub";
/* oxlint-disable typescript/await-thenable -- Bun's rejection matchers return promises at runtime. */
import { describe, expect, test } from "bun:test";

function fixture(options: Parameters<typeof createRealtimeHub>[1] = {}) {
  const sessions = new Map<string, Identity>();
  const changes: Change[] = [];
  let failures = 0;
  const deps: HubDependencies = {
    authenticate: async (headers, organizationId) => {
      const identity = sessions.get(headers.get("cookie") ?? "");
      return identity?.organizationId === organizationId ? identity : null;
    },
    canReceive: async () => true,
    readChanges: async () => changes.slice(),
    acknowledgeChanges: async (ids) => {
      for (const id of ids) {
        const index = changes.findIndex((change) => change.id === id);
        if (index >= 0) changes.splice(index, 1);
      }
    },
    reportFailure: () => {
      failures++;
    },
  };
  const hub = createRealtimeHub(deps, options);
  async function connect(userId = "user", organizationId: string | null = "org") {
    const cookie = `${userId}-${organizationId}`;
    sessions.set(cookie, { userId, organizationId });
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
  function change(audience: Change["audience"], domain: Change["domain"] = "messaging") {
    const row = { id: crypto.randomUUID(), audience, domain };
    changes.push(row);
    return row;
  }
  return {
    hub,
    deps,
    sessions,
    changes,
    connect,
    change,
    get failures() {
      return failures;
    },
  };
}

describe("realtime delivery", () => {
  test("coalesces 100 contiguous equivalent hints with one authorization and acknowledgement", async () => {
    const f = fixture();
    const viewer = await f.connect();
    await f.hub.tick(1);
    let authentications = 0;
    let permissions = 0;
    const acknowledgements: string[][] = [];
    const authenticate = f.deps.authenticate.bind(f.deps);
    const acknowledge = f.deps.acknowledgeChanges;
    f.deps.authenticate = async (...args) => {
      authentications++;
      return authenticate(...args);
    };
    f.deps.canReceive = async () => {
      permissions++;
      return true;
    };
    f.deps.acknowledgeChanges = async (ids) => {
      acknowledgements.push(ids);
      await acknowledge(ids);
    };
    const rows = Array.from({ length: 100 }, () => f.change(realtimeKeys.conversation("shared")));
    await f.hub.tick(2);
    expect(authentications).toBe(1);
    expect(permissions).toBe(1);
    expect(acknowledgements).toEqual([rows.map((row) => row.id)]);
    expect(viewer.events.slice(1)).toHaveLength(1);
    expect(viewer.events[1]).toMatchObject({ domain: "messaging", conversationId: "shared" });
    expect(rows.map((row) => row.id)).not.toContain(
      viewer.events[1]?.type === "change" ? viewer.events[1].id : undefined,
    );
    expect(f.changes).toEqual([]);
    f.hub.stop();
  });

  test("keeps exact audiences, domains, and access/reset boundaries in order", async () => {
    const f = fixture();
    const viewer = await f.connect();
    await f.hub.tick(1);
    const rows = [
      f.change(realtimeKeys.actor("org", "one"), "notifications"),
      f.change(realtimeKeys.actor("org", "two"), "notifications"),
      f.change(realtimeKeys.organization("org"), "tasks"),
      f.change(realtimeKeys.organization("org"), "access"),
      f.change(realtimeKeys.organization("org"), "access"),
      f.change(realtimeKeys.organization("org"), "tasks"),
      f.change(realtimeKeys.organization("org"), "session"),
      f.change(realtimeKeys.organization("org"), "session"),
      f.change(realtimeKeys.organization("org"), "organization"),
      f.change(realtimeKeys.organization("org"), "organization"),
      f.change(realtimeKeys.organization("org"), "profile"),
      f.change(realtimeKeys.organization("org"), "profile"),
      f.change(realtimeKeys.organization("org"), "tasks"),
    ];
    const checked: Change["audience"][] = [];
    f.deps.canReceive = async (_, audience) => {
      checked.push(audience);
      return true;
    };
    await f.hub.tick(2);
    expect(checked).toEqual(rows.map((row) => row.audience));
    expect(viewer.events.slice(1).map((event) => event.type === "change" && event.id)).toEqual(
      rows.map((row) => row.id),
    );
    f.hub.stop();
  });

  test("revalidates after an access boundary and does not deliver after session revocation", async () => {
    const f = fixture();
    const viewer = await f.connect();
    await f.hub.tick(1);
    f.change(realtimeKeys.organization("org"), "tasks");
    f.change(realtimeKeys.organization("org"), "tasks");
    const reset = f.change(realtimeKeys.organization("org"), "access");
    f.change(realtimeKeys.organization("org"), "tasks");
    f.change(realtimeKeys.organization("org"), "tasks");
    f.deps.canReceive = async (_, audience) => {
      if (audience[0] === "organization" && viewer.events.length === 2)
        f.sessions.delete(viewer.cookie);
      return true;
    };
    await f.hub.tick(2);
    expect(viewer.events.slice(1)).toMatchObject([
      { domain: "tasks" },
      { id: reset.id, domain: "access" },
    ]);
    expect(viewer.closed).toEqual([1008]);
    expect(f.changes).toEqual([]);
    f.hub.stop();
  });

  test("acknowledges only completed groups and stops after a resolver failure", async () => {
    const f = fixture();
    const viewer = await f.connect();
    const completed = f.change(realtimeKeys.organization("org"), "tasks");
    const failed = [
      f.change(realtimeKeys.conversation("private")),
      f.change(realtimeKeys.conversation("private")),
    ];
    const later = f.change(realtimeKeys.organization("org"), "context");
    f.deps.canReceive = async (_, audience) => {
      if (audience[0] === "conversation") throw new Error("unavailable");
      return true;
    };
    await f.hub.tick(1);
    expect(f.changes).toEqual([...failed, later]);
    expect(viewer.events.slice(1)).toMatchObject([{ id: completed.id }]);
    f.deps.canReceive = async () => true;
    await f.hub.tick(2);
    expect(f.changes).toEqual([]);
    expect(viewer.events.slice(1)).toHaveLength(3);
    f.hub.stop();
  });

  test("expanded retry groups get a fresh ID so client deduplication cannot hide new work", async () => {
    const f = fixture();
    const viewer = await f.connect();
    f.change(realtimeKeys.user("user"));
    f.change(realtimeKeys.user("user"));
    const acknowledge = f.deps.acknowledgeChanges;
    f.deps.acknowledgeChanges = async () => {
      throw new Error("unavailable");
    };
    await f.hub.tick(1);
    f.change(realtimeKeys.user("user"));
    f.deps.acknowledgeChanges = acknowledge;
    await f.hub.tick(2);
    const ids = viewer.events.slice(1).map((event) => event.type === "change" && event.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(f.changes).toEqual([]);
    f.hub.stop();
  });

  test("does not send or acknowledge a group when stopped during permission resolution", async () => {
    const f = fixture();
    const viewer = await f.connect();
    const rows = [f.change(realtimeKeys.user("user")), f.change(realtimeKeys.user("user"))];
    f.deps.canReceive = async () => {
      f.hub.stop();
      return true;
    };
    await f.hub.tick(1);
    expect(viewer.events).toEqual([{ version: 1, type: "ready" }]);
    expect(f.changes).toEqual(rows);
  });

  test("routes server-owned audiences, checks permissions, and uses the viewer's org", async () => {
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
    const organization = f.change(realtimeKeys.organization("org-a"));
    const conversation = f.change(realtimeKeys.conversation("shared-conversation"));
    const actor = f.change(realtimeKeys.actor("org-a", "owner-actor"), "notifications");
    const user = f.change(realtimeKeys.user("guest"), "profile");
    await f.hub.tick(1);
    expect(owner.events).toEqual([
      { version: 1, type: "ready" },
      {
        version: 1,
        type: "change",
        id: organization.id,
        organizationId: "org-a",
        domain: "messaging",
      },
      {
        version: 1,
        type: "change",
        id: conversation.id,
        organizationId: "org-a",
        domain: "messaging",
        conversationId: "shared-conversation",
      },
      {
        version: 1,
        type: "change",
        id: actor.id,
        organizationId: "org-a",
        domain: "notifications",
      },
    ]);
    expect(guest.events.slice(1)).toEqual([
      {
        version: 1,
        type: "change",
        id: conversation.id,
        organizationId: "org-b",
        domain: "messaging",
        conversationId: "shared-conversation",
      },
      { version: 1, type: "change", id: user.id, organizationId: "org-b", domain: "profile" },
    ]);
    expect(denied.events).toEqual([{ version: 1, type: "ready" }]);
    expect(account.events.slice(1)).toEqual([
      { version: 1, type: "change", id: user.id, organizationId: null, domain: "profile" },
    ]);
    expect(f.changes).toEqual([]);
    f.hub.stop();
  });

  test("session revocation and active-organization drift block sends between heartbeats", async () => {
    const f = fixture();
    const revoked = await f.connect("revoked");
    const moved = await f.connect("moved");
    await f.hub.tick(1);
    f.sessions.delete(revoked.cookie);
    f.sessions.set(moved.cookie, { userId: "moved", organizationId: "other" });
    f.change(realtimeKeys.organization("org"));
    await f.hub.tick(2);
    expect(revoked.events).toEqual([{ version: 1, type: "ready" }]);
    expect(moved.events).toEqual([{ version: 1, type: "ready" }]);
    expect(revoked.closed).toEqual([1008]);
    expect(moved.closed).toEqual([1008]);
    expect(f.hub.size).toBe(0);
  });

  test("heartbeat rechecks idle sessions and terminates peers that do not pong", async () => {
    const f = fixture({ heartbeatMs: 10 });
    const dead = await f.connect("dead");
    const revoked = await f.connect("revoked");
    const live = await f.connect("live");
    await f.hub.tick(1);
    expect(live.pings).toBe(1);
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

  test("bounds reservations per user and globally, and expires abandoned upgrades", async () => {
    const f = fixture({ maxConnections: 2, maxPerUser: 1 });
    const live = await f.connect();
    await expect(f.hub.reserve(new Headers({ cookie: live.cookie }), "org")).rejects.toThrow(
      "Realtime capacity reached",
    );
    f.sessions.set("pending", { userId: "pending", organizationId: null });
    const pending = await f.hub.reserve(new Headers({ cookie: "pending" }), null);
    expect(pending).not.toBeNull();
    await expect(f.hub.reserve(new Headers({ cookie: "pending" }), null)).rejects.toThrow(
      "Realtime capacity reached",
    );
    await f.hub.tick(Date.now() + 20_000);
    expect(f.hub.size).toBe(1);
    expect(await f.hub.reserve(new Headers({ cookie: "pending" }), null)).not.toBeNull();
    f.hub.stop();
  });

  test("disconnects slow peers and unexpected client subscriptions without queuing", async () => {
    const f = fixture({ maxBufferedBytes: 16 });
    const slow = await f.connect("slow");
    const client = await f.connect("client");
    slow.backlog(17);
    f.hub.unexpectedMessage(client.connection);
    const row = f.change(realtimeKeys.organization("org"));
    await f.hub.tick(1);
    expect(slow.events).toEqual([{ version: 1, type: "ready" }]);
    expect(slow.closed).toEqual([1013]);
    expect(client.closed).toEqual([1008]);
    expect(f.hub.size).toBe(0);
    expect(f.changes).toEqual([row]);
    await f.hub.tick(2);
    expect(f.changes).toEqual([]);
  });

  test("retries resolver failures without deleting the undelivered outbox row", async () => {
    const f = fixture();
    const viewer = await f.connect();
    const row = f.change(realtimeKeys.conversation("private"));
    f.deps.canReceive = async () => {
      throw new Error("database unavailable");
    };
    await f.hub.tick(1);
    expect(f.failures).toBe(1);
    expect(f.changes).toEqual([row]);
    expect(viewer.events).toHaveLength(1);
    f.deps.canReceive = async () => true;
    await f.hub.tick(2);
    expect(f.changes).toEqual([]);
    expect(viewer.events[1]).toMatchObject({ type: "change", id: row.id });
    f.hub.stop();
  });

  test("retains rows on acknowledgement failure and tolerates duplicate delivery", async () => {
    const f = fixture();
    const viewer = await f.connect();
    const row = f.change(realtimeKeys.user("user"));
    const acknowledge = f.deps.acknowledgeChanges;
    f.deps.acknowledgeChanges = async () => {
      throw new Error("write unavailable");
    };
    await f.hub.tick(1);
    expect(f.changes).toEqual([row]);
    f.deps.acknowledgeChanges = acknowledge;
    await f.hub.tick(2);
    expect(viewer.events.slice(1).map((event) => event.type === "change" && event.id)).toEqual([
      row.id,
      row.id,
    ]);
    expect(f.changes).toEqual([]);
    f.hub.stop();
  });

  test("serializes dispatch and stops in-flight work without acknowledgement or delivery", async () => {
    const f = fixture();
    const viewer = await f.connect();
    const row = f.change(realtimeKeys.user("user"));
    const gate = Promise.withResolvers<Change[]>();
    let reads = 0;
    f.deps.readChanges = async () => {
      reads++;
      return gate.promise;
    };
    const first = f.hub.tick(1);
    // Let the heartbeat finish before the read blocks.
    await Bun.sleep(0);
    await f.hub.tick(2);
    expect(reads).toBe(1);
    f.hub.stop();
    gate.resolve([row]);
    await first;
    expect(f.changes).toEqual([row]);
    expect(viewer.events).toEqual([{ version: 1, type: "ready" }]);
    expect(viewer.terminated).toBe(true);
    await expect(f.hub.reserve(new Headers({ cookie: viewer.cookie }), "org")).rejects.toThrow(
      "Realtime capacity reached",
    );
  });
});
