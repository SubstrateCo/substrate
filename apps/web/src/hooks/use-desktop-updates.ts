import type { DesktopUpdatesAPI } from "@substrate/contracts/desktop/updates-ipc";

import { useSyncExternalStore } from "react";

import { desktopUpdatesStore } from "./desktop-updates-store";

export function useDesktopUpdates(bridge: DesktopUpdatesAPI) {
  const store = desktopUpdatesStore(bridge);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => undefined);
}
