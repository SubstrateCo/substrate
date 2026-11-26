import { realtimeKeys } from "@substrate/contracts/realtime";
import type { RealtimeEvent } from "@substrate/contracts/realtime";
import { realtimeEvent } from "@substrate/contracts/realtime";

import { createApp } from "../../app";
import { appFixture } from "../../test-support";
import { createRealtimeHub } from "./hub";
import type { Change } from "./hub";
import { createRealtimeRoutes } from "./routes";
import { testReceiver } from "./test-support";
import type { WebSocketOptions } from "bun";
import { afterEach, expect, test } from "bun:test";

const trustedOrigin = "https://desktop.substrate.local";
// SAFETY: Tests run on Bun, whose native constructor accepts WebSocketOptions.
// lib.dom shadows that runtime overload; preserve its existing overloads too.
const BunWebSocket = globalThis.WebSocket as typeof globalThis.WebSocket & {
  new (url: string, options: WebSocketOptions): WebSocket;
};
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

function fixture(options: Parameters<typeof createRealtimeHub>[1] = {}) {
  let active = true;
  const hub = createRealtimeHub(
    {
      authenticate: async (headers, organizationId) =>
        active && headers.get("cookie") === "session=test"
          ? testReceiver({ userId: "user", organizationId, actorId: organizationId && "actor" })
          : null,
      recipients: async (audience) => () => audience[1] !== "forbidden-conversation",
      reportFailure: () => {
        throw new Error("Unexpected dispatch failure");
      },
    },
    options,
  );
  const realtime = createRealtimeRoutes(hub, [trustedOrigin, "http://localhost:3000"]);
  const http = createApp({ ...appFixture(), realtime });
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    websocket: realtime.websocket,
    fetch: http.fetch,
  });
  cleanup.push(() => {
    hub.stop();
    void server.stop(true);
  });
  function connect(query = "?organizationId=org", prefix = "/api/v1") {
    const socket = new BunWebSocket(
      new URL(`${prefix}/realtime${query}`, server.url).toString().replace("http:", "ws:"),
      {
        headers: { Origin: trustedOrigin, Cookie: "session=test" },
      },
    );
    cleanup.push(() => socket.close());
    const messages: RealtimeEvent[] = [];
    const pending: ((event: RealtimeEvent) => void)[] = [];
    socket.addEventListener("message", (event) => {
      const message = realtimeEvent.parse(JSON.parse(String(event.data)));
      const resolve = pending.shift();
      if (resolve) resolve(message);
      else messages.push(message);
    });
    const closed = new Promise<CloseEvent>((resolve) => socket.addEventListener("close", resolve));
    return {
      socket,
      closed,
      next: () =>
        messages.length
          ? Promise.resolve(messages.shift()!)
          : new Promise<RealtimeEvent>((resolve) => pending.push(resolve)),
    };
  }
  return {
    server,
    hub,
    connect,
    revoke: () => {
      active = false;
    },
  };
}

test.each(["/api/v1", "/api/mobile"])(
  "%s Bun transport upgrades, reconnects, and filters delivery",
  async (prefix) => {
    const f = fixture();
    const first = f.connect("?organizationId=org", prefix);
    expect(await first.next()).toEqual({ version: 1, type: "ready" });
    const denied: Change = {
      id: crypto.randomUUID(),
      domain: "messaging",
      audience: realtimeKeys.conversation("forbidden-conversation"),
    };
    const allowed: Change = {
      id: crypto.randomUUID(),
      domain: "messaging",
      audience: realtimeKeys.conversation("shared-conversation"),
    };
    await f.hub.publish(denied);
    await f.hub.publish(allowed);
    expect(await first.next()).toEqual({
      version: 1,
      type: "change",
      id: allowed.id,
      organizationId: "org",
      domain: "messaging",
      conversationId: "shared-conversation",
    });
    first.socket.close();
    await first.closed;
    const second = f.connect("", prefix);
    expect(await second.next()).toEqual({ version: 1, type: "ready" });
    const profile: Change = {
      id: crypto.randomUUID(),
      domain: "profile",
      audience: realtimeKeys.user("user"),
    };
    await f.hub.publish(profile);
    expect(await second.next()).toEqual({
      version: 1,
      type: "change",
      id: profile.id,
      organizationId: null,
      domain: "profile",
    });
    const normal = await fetch(new URL("/missing", f.server.url));
    expect(normal.status).toBe(404);
    expect(normal.headers.get("x-content-type-options")).toBe("nosniff");
  },
);

test.each(["/api/v1", "/api/mobile"])(
  "%s rejects untrusted origins, unauthenticated cookies, and subscription input",
  async (prefix) => {
    const f = fixture();
    async function status(path: string, origin: string | null, cookie = "session=test") {
      const headers = new Headers({ Upgrade: "websocket", Cookie: cookie });
      if (origin) headers.set("Origin", origin);
      return (await fetch(new URL(path, f.server.url), { headers })).status;
    }
    expect(await status(`${prefix}/realtime`, "https://evil.example")).toBe(403);
    expect(await status(`${prefix}/realtime`, null)).toBe(403);
    expect(await status(`${prefix}/realtime`, trustedOrigin, "")).toBe(403);
    expect(await status(`${prefix}/realtime?organizationId=`, trustedOrigin)).toBe(400);
    expect(await status(`${prefix}/realtime?room=private`, trustedOrigin)).toBe(400);
    expect(
      await status(`${prefix}/realtime?organizationId=a&organizationId=b`, trustedOrigin),
    ).toBe(400);
    const invalid = await fetch(new URL(`${prefix}/realtime?room=private`, f.server.url), {
      headers: { Upgrade: "websocket", Cookie: "session=test", Origin: trustedOrigin },
    });
    expect(await invalid.text()).toBe("");
  },
);

test("real sockets close on unexpected client data, revocation, oversized payload, and shutdown", async () => {
  const f = fixture();
  const unexpected = f.connect();
  await unexpected.next();
  unexpected.socket.send(JSON.stringify({ subscribe: "private" }));
  expect((await unexpected.closed).code).toBe(1008);
  expect(f.hub.size).toBe(0);

  const oversized = f.connect();
  await oversized.next();
  oversized.socket.send("x".repeat(2048));
  await oversized.closed;
  expect(f.hub.size).toBe(0);

  const revoked = f.connect();
  await revoked.next();
  f.revoke();
  await f.hub.tick(Date.now() + 60_000);
  expect((await revoked.closed).code).toBe(1008);
  expect(f.hub.size).toBe(0);
});

test("shutdown disconnects real sockets and removes all recipients", async () => {
  const f = fixture();
  const peer = f.connect();
  await peer.next();
  f.hub.stop();
  await peer.closed;
  expect(f.hub.size).toBe(0);
});

test("connection capacity rejects transiently, not as revoked access, and recovers when a slot opens", async () => {
  const f = fixture({ maxPerUser: 1 });
  const first = f.connect();
  await first.next();
  const response = await fetch(new URL("/api/v1/realtime?organizationId=org", f.server.url), {
    headers: { Upgrade: "websocket", Origin: trustedOrigin, Cookie: "session=test" },
  });
  expect(response.status).toBe(503);
  first.socket.close();
  await first.closed;
  const recovered = f.connect();
  expect(await recovered.next()).toEqual({ version: 1, type: "ready" });
});

test("raw Bun pong callbacks keep a live peer eligible for the next heartbeat", async () => {
  const f = fixture();
  const peer = f.connect();
  await peer.next();
  const ponged = Promise.withResolvers<void>();
  const pong = f.hub.pong.bind(f.hub);
  f.hub.pong = (connection) => {
    pong(connection);
    ponged.resolve();
  };
  await f.hub.tick(1);
  // The client answers the ping automatically; wait until its pong reaches the hub.
  await ponged.promise;
  const row: Change = {
    id: crypto.randomUUID(),
    domain: "tasks",
    audience: realtimeKeys.organization("org"),
  };
  await f.hub.tick(15_001);
  await f.hub.publish(row);
  expect(f.hub.size).toBe(1);
  expect(await peer.next()).toMatchObject({ type: "change", id: row.id });
});
