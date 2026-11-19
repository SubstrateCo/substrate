import type { RealtimeUpdate } from "@substrate/contracts/realtime";

import { createBrowserRealtime, type BrowserRealtimeSocket } from "./browser";
import { afterEach, expect, jest, test } from "bun:test";

const ready = JSON.stringify({ version: 1, type: "ready" });

function fixture() {
  const sockets: (BrowserRealtimeSocket & { closed: boolean })[] = [];
  const urls: string[] = [];
  const updates: RealtimeUpdate[] = [];
  const retries: { callback: () => void; delay: number }[] = [];
  const api = createBrowserRealtime({
    origin: "https://app.example.test",
    createSocket: (url) => {
      urls.push(url.href);
      const socket = {
        onmessage: null,
        onclose: null,
        onerror: null,
        closed: false,
        close() {
          socket.closed = true;
        },
      };
      sockets.push(socket);
      return socket;
    },
    random: () => 0,
    schedule: (callback, delay) => {
      retries.push({ callback, delay });
      return setTimeout(() => {}, 0);
    },
  });
  api.onEvent((event) => updates.push(event));
  const message = (data: string | ArrayBuffer) =>
    sockets.at(-1)!.onmessage?.(new MessageEvent("message", { data }));
  const close = (code: number) => sockets.at(-1)!.onclose?.(new CloseEvent("close", { code }));
  return { api, sockets, urls, updates, retries, message, close };
}

afterEach(() => {
  jest.useRealTimers();
});

test("connects to the same-origin realtime endpoint and delivers text frames", async () => {
  const f = fixture();
  await f.api.connect({ organizationId: "org" });
  expect(f.urls).toEqual(["wss://app.example.test/api/v1/realtime?organizationId=org"]);
  f.message(ready);
  expect(f.updates.slice(-2)).toEqual([
    { version: 1, type: "ready" },
    { type: "status", status: "connected" },
  ]);
  await f.api.disconnect();
  expect(f.sockets[0]!.closed).toBe(true);
});

test("drops frames over 64 KB and non-text frames", async () => {
  const f = fixture();
  await f.api.connect({ organizationId: null });
  f.message(ready.padEnd(64 * 1024 + 1, " "));
  f.message(new TextEncoder().encode(ready).buffer);
  expect(f.updates).toEqual([{ type: "status", status: "connecting" }]);
  f.message(ready.padEnd(64 * 1024, " "));
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "connected" });
});

test.each([1008, 4401, 4403])("close code %i is forbidden", async (code) => {
  const f = fixture();
  await f.api.connect({ organizationId: "org" });
  f.close(code);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "forbidden" });
  expect(f.retries).toHaveLength(0);
});

test("other close codes retry", async () => {
  const f = fixture();
  await f.api.connect({ organizationId: "org" });
  f.close(1006);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "disconnected" });
  expect(f.retries).toHaveLength(1);
});

test("a socket error closes the socket and leaves retry policy to the close event", async () => {
  const f = fixture();
  await f.api.connect({ organizationId: "org" });
  f.sockets[0]!.onerror?.(new Event("error"));
  expect(f.sockets[0]!.closed).toBe(true);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "connecting" });
  expect(f.retries).toHaveLength(0);
});

test("events reach every subscribed listener until it unsubscribes", async () => {
  const f = fixture();
  const second: RealtimeUpdate[] = [];
  const unsubscribe = f.api.onEvent((event) => second.push(event));
  await f.api.connect({ organizationId: "org" });
  expect(second).toEqual([{ type: "status", status: "connecting" }]);
  unsubscribe();
  f.message(ready);
  expect(second).toHaveLength(1);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "connected" });
});

test("a socket that is not ready within 10 seconds is closed", async () => {
  jest.useFakeTimers();
  const f = fixture();
  await f.api.connect({ organizationId: "org" });
  jest.advanceTimersByTime(9_999);
  expect(f.sockets[0]!.closed).toBe(false);
  jest.advanceTimersByTime(1);
  expect(f.sockets[0]!.closed).toBe(true);
  expect(f.retries).toHaveLength(1);
});
