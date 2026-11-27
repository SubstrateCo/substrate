import { realtimeEventChannel, type RealtimeUpdate } from "@substrate/contracts/realtime";

import { emitToRenderer } from "./realtime-events.ts";
import { expect, test } from "bun:test";

test("shutdown does not read webContents from an already destroyed BrowserWindow", () => {
  const window = {
    isDestroyed: () => true,
    get webContents(): never {
      throw new Error("Object has been destroyed");
    },
  };
  expect(() =>
    emitToRenderer(
      window,
      realtimeEventChannel,
      { type: "status", status: "disconnected" },
      "https://desktop.substrate.local",
    ),
  ).not.toThrow();
});

test("only a live internal renderer receives socket updates", () => {
  const sent: unknown[][] = [];
  let destroyed = false;
  let url = "https://desktop.substrate.local/messages";
  const window = {
    isDestroyed: () => false,
    webContents: {
      isDestroyed: () => destroyed,
      getURL: () => url,
      send: (channel: string, value: RealtimeUpdate) => sent.push([channel, value]),
    },
  };
  const event = { type: "status", status: "disconnected" } as const;
  emitToRenderer(window, realtimeEventChannel, event, "https://desktop.substrate.local");
  expect(sent).toEqual([[realtimeEventChannel, event]]);
  destroyed = true;
  emitToRenderer(window, realtimeEventChannel, event, "https://desktop.substrate.local");
  destroyed = false;
  url = "https://outside.example/";
  emitToRenderer(window, realtimeEventChannel, event, "https://desktop.substrate.local");
  emitToRenderer(undefined, realtimeEventChannel, event, "https://desktop.substrate.local");
  expect(sent).toHaveLength(1);
});
