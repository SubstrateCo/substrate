import type { DesktopUpdateStatus } from "@substrate/contracts/desktop/updates-ipc";

import { expect, test } from "bun:test";

import { desktopUpdatesStore } from "./desktop-updates-store";

const status = (state: DesktopUpdateStatus["state"]): DesktopUpdateStatus => ({
  appVersion: "1.0.0",
  install: "automatic",
  state,
});

function fakeBridge() {
  const listeners = new Set<(next: DesktopUpdateStatus) => void>();
  const reads: ((value: DesktopUpdateStatus) => void)[] = [];
  return {
    listeners,
    reads,
    get: () => new Promise<DesktopUpdateStatus>((resolve) => reads.push(resolve)),
    onChange: (callback: (next: DesktopUpdateStatus) => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    push: (next: DesktopUpdateStatus) => {
      for (const listener of listeners) listener(next);
    },
  };
}

test("every subscriber shares one bridge subscription and one read", async () => {
  const bridge = fakeBridge();
  const store = desktopUpdatesStore(bridge);
  const stopFirst = store.subscribe(() => {});
  const stopSecond = store.subscribe(() => {});
  expect(bridge.listeners.size).toBe(1);
  expect(bridge.reads).toHaveLength(1);
  bridge.reads[0]!(status({ status: "idle" }));
  await Promise.resolve();
  expect(store.getSnapshot()).toEqual(status({ status: "idle" }));
  stopFirst();
  expect(bridge.listeners.size).toBe(1);
  stopSecond();
  expect(bridge.listeners.size).toBe(0);
});

test("a change that arrives while the first read is in flight wins over that read", async () => {
  const bridge = fakeBridge();
  const store = desktopUpdatesStore(bridge);
  let notified = 0;
  store.subscribe(() => notified++);
  bridge.push(status({ status: "checking" }));
  bridge.reads[0]!(status({ status: "idle" }));
  await Promise.resolve();
  expect(store.getSnapshot()).toEqual(status({ status: "checking" }));
  expect(notified).toBe(1);
});

test("the same bridge always gives the same store", () => {
  const bridge = fakeBridge();
  expect(desktopUpdatesStore(bridge)).toBe(desktopUpdatesStore(bridge));
});
