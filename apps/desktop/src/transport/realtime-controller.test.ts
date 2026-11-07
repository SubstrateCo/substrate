import { desktopOrigin } from "@startup-os/contracts/desktop/links";
import type { RealtimeUpdate } from "@startup-os/contracts/realtime";

import { createRealtimeController } from "./realtime-controller.ts";
import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";

function fixture() {
  const sockets: (EventEmitter & { terminate: () => void })[] = [];
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
      const socket = Object.assign(new EventEmitter(), { terminate() {} });
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

test("authenticated transport validates input and wire events, then publishes ready before connected", () => {
  const f = fixture();
  expect(() => f.controller.connect({ organizationId: "" })).toThrow();
  expect(f.requests).toHaveLength(0);
  f.controller.connect({ organizationId: null });
  expect(f.requests[0]?.url.href).toBe("wss://api.example.test/api/v1/realtime");
  expect(f.requests[0]?.headers.Cookie).toBe("private-cookie");
  expect(f.requests[0]?.headers.Origin).toBe(desktopOrigin);
  f.sockets[0]!.emit("message", "not-json");
  f.sockets[0]!.emit("message", JSON.stringify({ version: 2, type: "ready" }));
  f.sockets[0]!.emit(
    "message",
    JSON.stringify({
      version: 1,
      type: "change",
      id: crypto.randomUUID(),
      organizationId: "wrong-workspace",
      domain: "tasks",
    }),
  );
  expect(f.updates).toEqual([{ type: "status", status: "connecting" }]);
  f.sockets[0]!.emit("message", JSON.stringify({ version: 1, type: "ready" }));
  expect(f.updates.slice(-2)).toEqual([
    { version: 1, type: "ready" },
    { type: "status", status: "connected" },
  ]);
  f.controller.disconnect();
});

test("retry grows with a bound and stale callbacks cannot reconnect or deliver across workspace changes", () => {
  const f = fixture();
  f.controller.connect({ organizationId: "first" });
  for (let index = 0; index < 10; index++) {
    f.sockets[index]!.emit("close", 1006);
    f.retries[index]!.callback();
  }
  expect(f.retries[0]?.delay).toBe(500);
  expect(f.retries[9]?.delay).toBe(30_000);
  f.sockets.at(-1)!.emit("close", 1006);
  const stale = f.retries.at(-1)!;
  f.controller.connect({ organizationId: "second" });
  const count = f.sockets.length;
  stale.callback();
  f.sockets[0]!.emit("message", JSON.stringify({ version: 1, type: "ready" }));
  expect(f.sockets).toHaveLength(count);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "connecting" });
  f.controller.disconnect();
  f.sockets.at(-1)!.emit("close", 1006);
  expect(f.retries.at(-1)).toBe(stale);
});

test("forbidden closes do not retry", () => {
  const f = fixture();
  f.controller.connect({ organizationId: "org" });
  f.sockets[0]!.emit("close", 4403);
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "forbidden" });
  expect(f.retries).toHaveLength(0);
});
