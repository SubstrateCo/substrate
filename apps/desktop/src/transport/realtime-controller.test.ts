import { desktopOrigin } from "@substrate/contracts/desktop/links";
import type { RealtimeUpdate } from "@substrate/contracts/realtime";

import { createRealtimeController } from "./realtime-controller.ts";
import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";

const ready = () => Buffer.from(JSON.stringify({ version: 1, type: "ready" }), "utf8");

function fixture() {
  const sockets: (EventEmitter & { terminated: boolean; terminate: () => void })[] = [];
  const updates: RealtimeUpdate[] = [];
  const retries: { callback: () => void; delay: number }[] = [];
  const requests: { url: URL; headers: Record<string, string> }[] = [];
  const controller = createRealtimeController({
    backend: "https://api.example.test",
    getCookie: () => "private-cookie",
    emit: (event) => updates.push(event),
    random: () => 1,
    createSocket: (url, headers) => {
      requests.push({ url, headers });
      const socket = Object.assign(new EventEmitter(), {
        terminated: false,
        terminate() {
          socket.terminated = true;
        },
      });
      sockets.push(socket);
      return socket;
    },
    schedule: (callback, delay) => {
      retries.push({ callback, delay });
      return setTimeout(() => {}, 0);
    },
  });
  return { controller, sockets, updates, retries, requests };
}

test("connects with the session cookie and desktop origin and decodes Buffer frames", () => {
  const f = fixture();
  f.controller.connect({ organizationId: null });
  expect(f.requests[0]?.url.href).toBe("wss://api.example.test/api/v1/realtime");
  expect(f.requests[0]?.headers).toEqual({ Cookie: "private-cookie", Origin: desktopOrigin });
  f.sockets[0]!.emit("message", ready());
  expect(f.updates.slice(-2)).toEqual([
    { version: 1, type: "ready" },
    { type: "status", status: "connected" },
  ]);
  f.controller.disconnect();
  expect(f.sockets[0]!.terminated).toBe(true);
});

test.each([401, 403])(
  "an unexpected %i upgrade response is forbidden and terminates the socket",
  (statusCode) => {
    const f = fixture();
    f.controller.connect({ organizationId: "org" });
    let resumed = false;
    f.sockets[0]!.emit(
      "unexpected-response",
      {},
      {
        statusCode,
        resume() {
          resumed = true;
        },
      },
    );
    expect(resumed).toBe(true);
    expect(f.sockets[0]!.terminated).toBe(true);
    expect(f.updates.at(-1)).toEqual({ type: "status", status: "forbidden" });
    expect(f.retries).toHaveLength(0);
  },
);

test("other unexpected upgrade responses retry", () => {
  const f = fixture();
  f.controller.connect({ organizationId: "org" });
  f.sockets[0]!.emit("unexpected-response", {}, { statusCode: 502, resume() {} });
  expect(f.sockets[0]!.terminated).toBe(true);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "disconnected" });
  expect(f.retries).toHaveLength(1);
});

test.each([1008, 4401, 4403])("close code %i is forbidden", (code) => {
  const f = fixture();
  f.controller.connect({ organizationId: "org" });
  f.sockets[0]!.emit("close", code);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "forbidden" });
  expect(f.retries).toHaveLength(0);
});

test("other close codes retry", () => {
  const f = fixture();
  f.controller.connect({ organizationId: "org" });
  f.sockets[0]!.emit("close", 1006);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "disconnected" });
  expect(f.retries).toHaveLength(1);
});

test("a socket error ends the connection and terminates the socket", () => {
  const f = fixture();
  f.controller.connect({ organizationId: "org" });
  f.sockets[0]!.emit("error", new Error("reset"));
  expect(f.sockets[0]!.terminated).toBe(true);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "disconnected" });
  expect(f.retries).toHaveLength(1);
});
