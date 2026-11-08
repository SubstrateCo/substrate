import { navigationTarget } from "../shell/navigation.js";
import type { WebContents } from "electron";

export function emitToRenderer<T>(
  window:
    | {
        isDestroyed(): boolean;
        readonly webContents: Pick<WebContents, "isDestroyed" | "getURL" | "send">;
      }
    | undefined,
  channel: string,
  event: T,
  rendererOrigin: string,
) {
  if (!window || window.isDestroyed()) return;
  const contents = window.webContents;
  if (!contents.isDestroyed() && navigationTarget(contents.getURL(), rendererOrigin) === "internal")
    contents.send(channel, event);
}
