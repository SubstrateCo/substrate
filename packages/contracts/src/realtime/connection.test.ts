import { createRealtimeConnection, type RealtimeTransportHandlers } from "./connection.ts";
import type { RealtimeUpdate } from "./protocol.ts";
import { afterEach, expect, jest, test } from "bun:test";

const ready = JSON.stringify({ version: 1, type: "ready" });

function fixture({
  handshakeTimeout,
  fail = false,
}: { handshakeTimeout?: number; fail?: boolean } = {}) {
  const sockets: (RealtimeTransportHandlers & { url: string; closed: boolean })[] = [];
  const updates: RealtimeUpdate[] = [];
  const retries: { callback: () => void; delay: number }[] = [];
  const connection = createRealtimeConnection({
    origin: "https://api.example.test",
    emit: (event) => updates.push(event),
    handshakeTimeout,
    random: () => 1,
    schedule: (callback, delay) => {
      retries.push({ callback, delay });
      return setTimeout(() => {}, 0);
    },
    open(url, handlers) {
      if (fail) throw new Error("socket unavailable");
      const socket = { ...handlers, url: url.href, closed: false };
      sockets.push(socket);
      return {
        close() {
          socket.closed = true;
        },
      };
    },
  });
  return { connection, sockets, updates, retries };
}

afterEach(() => {
  jest.useRealTimers();
});

test("a new connect closes the previous socket and fences its callbacks and pending retry", () => {
  const f = fixture();
  f.connection.connect({ organizationId: "first" });
  const first = f.sockets[0]!;
  first.end();
  const stale = f.retries[0]!;
  f.connection.connect({ organizationId: "second" });
  expect(first.closed).toBe(true);
  expect(f.sockets).toHaveLength(2);
  expect(f.sockets[1]!.url).toBe("wss://api.example.test/api/v1/realtime?organizationId=second");
  stale.callback();
  first.message(ready);
  first.end();
  expect(f.sockets).toHaveLength(2);
  expect(f.retries).toHaveLength(1);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "connecting" });
});

test("disconnect closes the socket and a pending retry cannot reopen it", () => {
  const f = fixture();
  f.connection.connect({ organizationId: null });
  f.sockets[0]!.end();
  f.connection.disconnect();
  f.retries[0]!.callback();
  f.sockets[0]!.end();
  expect(f.sockets).toHaveLength(1);
  expect(f.retries).toHaveLength(1);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "disconnected" });
});

test("backoff doubles up to its bound and ready resets it", () => {
  const f = fixture();
  f.connection.connect({ organizationId: "org" });
  for (let index = 0; index < 8; index++) {
    f.sockets[index]!.end();
    f.retries[index]!.callback();
  }
  expect(f.retries.map((retry) => retry.delay)).toEqual([
    500, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
  ]);
  f.sockets.at(-1)!.message(ready);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "connected" });
  f.sockets.at(-1)!.end();
  expect(f.retries.at(-1)!.delay).toBe(500);
});

test("forbidden endings stop retrying until an explicit connect", () => {
  const f = fixture();
  f.connection.connect({ organizationId: "org" });
  f.sockets[0]!.end(true);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "forbidden" });
  expect(f.retries).toHaveLength(0);
  f.connection.connect({ organizationId: "org" });
  f.sockets[1]!.message(ready);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "connected" });
});

test("a transport that fails to open schedules a retry", () => {
  const f = fixture({ fail: true });
  f.connection.connect({ organizationId: "org" });
  expect(f.updates).toEqual([
    { type: "status", status: "connecting" },
    { type: "status", status: "disconnected" },
  ]);
  expect(f.retries).toHaveLength(1);
});

test("only valid events for the connected workspace are delivered", () => {
  const f = fixture();
  f.connection.connect({ organizationId: "org" });
  const change = (organizationId: string) =>
    JSON.stringify({
      version: 1,
      type: "change",
      id: crypto.randomUUID(),
      organizationId,
      domain: "tasks",
    });
  f.sockets[0]!.message("not-json");
  f.sockets[0]!.message(JSON.stringify({ version: 2, type: "ready" }));
  f.sockets[0]!.message(change("other"));
  expect(f.updates).toEqual([{ type: "status", status: "connecting" }]);
  f.sockets[0]!.message(change("org"));
  expect(f.updates.at(-1)).toMatchObject({ type: "change", organizationId: "org" });
});

test("handshake timeout ends and closes a socket that never becomes ready", () => {
  jest.useFakeTimers();
  const f = fixture({ handshakeTimeout: 10_000 });
  f.connection.connect({ organizationId: "org" });
  jest.advanceTimersByTime(10_000);
  expect(f.sockets[0]!.closed).toBe(true);
  expect(f.retries).toHaveLength(1);
  f.retries[0]!.callback();
  f.sockets[1]!.message(ready);
  jest.advanceTimersByTime(10_000);
  expect(f.sockets[1]!.closed).toBe(false);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "connected" });
});
