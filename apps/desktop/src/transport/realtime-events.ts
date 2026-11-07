import { realtimeEventChannel, type RealtimeUpdate } from "@startup-os/contracts/realtime";

import { navigationTarget } from "../shell/navigation.js";
import type { WebContents } from "electron";

export function emitRealtimeUpdate(
  window:
    | {
        isDestroyed(): boolean;
        readonly webContents: Pick<WebContents, "isDestroyed" | "getURL" | "send">;
      }
    | undefined,
  event: RealtimeUpdate,
  rendererOrigin: string,
) {
  if (!window || window.isDestroyed()) return;
  const contents = window.webContents;
  if (!contents.isDestroyed() && navigationTarget(contents.getURL(), rendererOrigin) === "internal")
    contents.send(realtimeEventChannel, event);
}
