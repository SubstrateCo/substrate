import { desktopApi } from "@/api/client";
import { readResult } from "@/api/result";

export function getDesktopRelease(signal?: AbortSignal) {
  return readResult(desktopApi.release.$get({}, { init: { signal } }));
}
