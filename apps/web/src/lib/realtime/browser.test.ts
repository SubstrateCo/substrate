import type { RealtimeUpdate } from "@substrate/contracts/realtime";

import { createBrowserRealtime, type BrowserRealtimeSocket } from "./browser";
import { expect, test } from "bun:test";

function fixture() {
  const sockets: BrowserRealtimeSocket[] = [];
  const urls: string[] = [];
  const updates: RealtimeUpdate[] = [];
  const retries: { callback: () => void; delay: number }[] = [];
  const api = createBrowserRealtime({
    origin: "https://app.example.test",
    createSocket: (url) => {
      urls.push(url.href);
      const socket: BrowserRealtimeSocket = {
        onmessage: null,
        onclose: null,
        onerror: null,
        close() {},
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
  return { api, sockets, urls, updates, retries };
}

test("browser socket uses same-origin cookies implicitly, validates data and fences old workspace events", async () => {
  const f = fixture();
  await f.api.connect({ organizationId: null });
  expect(f.urls).toEqual(["wss://app.example.test/api/v1/realtime"]);
  f.sockets[0]!.onmessage?.(new MessageEvent("message", { data: "invalid" }));
  f.sockets[0]!.onmessage?.(
    new MessageEvent("message", {
      data: JSON.stringify({
        version: 1,
        type: "change",
        id: crypto.randomUUID(),
        organizationId: "wrong",
        domain: "tasks",
      }),
    }),
  );
  expect(f.updates).toEqual([{ type: "status", status: "connecting" }]);
  f.sockets[0]!.onmessage?.(
    new MessageEvent("message", { data: JSON.stringify({ version: 1, type: "ready" }) }),
  );
  expect(f.updates.slice(-2)).toEqual([
    { version: 1, type: "ready" },
    { type: "status", status: "connected" },
  ]);
  await f.api.connect({ organizationId: "next" });
  f.sockets[0]!.onmessage?.(
    new MessageEvent("message", { data: JSON.stringify({ version: 1, type: "ready" }) }),
  );
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "connecting" });
  expect(f.urls.at(-1)).toBe("wss://app.example.test/api/v1/realtime?organizationId=next");
  await f.api.disconnect();
});

test("browser retries use bounded exponential jitter and cannot restart after disconnect; forbidden never retries", async () => {
  const f = fixture();
  await f.api.connect({ organizationId: "org" });
  for (let index = 0; index < 10; index++) {
    f.sockets[index]!.onclose?.(new CloseEvent("close", { code: 1006 }));
    f.retries[index]!.callback();
  }
  expect(f.retries[0]?.delay).toBe(250);
  expect(f.retries[9]?.delay).toBe(15_000);
  f.sockets.at(-1)!.onclose?.(new CloseEvent("close", { code: 1008 }));
  expect(f.updates.at(-1)).toEqual({ type: "status", status: "forbidden" });
  expect(f.retries).toHaveLength(10);
  await f.api.disconnect();
  const count = f.urls.length;
  f.retries.at(-1)!.callback();
  expect(f.urls).toHaveLength(count);
});
