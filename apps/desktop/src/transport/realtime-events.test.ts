import { realtimeEventChannel, type RealtimeUpdate } from "@startup-os/contracts/realtime";

import { emitRealtimeUpdate } from "./realtime-events.ts";
import { expect, test } from "bun:test";

test("shutdown does not read webContents from an already destroyed BrowserWindow", () => {
  const window = {
    isDestroyed: () => true,
    get webContents(): never {
      throw new Error("Object has been destroyed");
    },
  };
  expect(() =>
    emitRealtimeUpdate(
      window,
      { type: "status", status: "disconnected" },
      "https://desktop.startup-os.local",
    ),
  ).not.toThrow();
});

test("only a live internal renderer receives socket updates", () => {
  const sent: unknown[][] = [];
  let destroyed = false;
  let url = "https://desktop.startup-os.local/dashboard";
  const window = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => destroyed,
      getURL: () => url,
      send: (channel: string, value: RealtimeUpdate) => sent.push([channel, value]),
    },
  };
  const event = { type: "status", status: "disconnected" } as const;
  emitRealtimeUpdate(window, event, "https://desktop.startup-os.local");
  expect(sent).toEqual([[realtimeEventChannel, event]]);
  destroyed = true;
  emitRealtimeUpdate(window, event, "https://desktop.startup-os.local");
  destroyed = false;
  url = "https://outside.example/";
  emitRealtimeUpdate(window, event, "https://desktop.startup-os.local");
  emitRealtimeUpdate(undefined, event, "https://desktop.startup-os.local");
  expect(sent).toHaveLength(1);
});
