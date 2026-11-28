import { useState } from "react";

/** Records this recent when they first render arrived while the person watched. */
const LIVE_WINDOW_MS = 10_000;

/**
 * Whether a record arrived live, so its entrance may animate. History that mounts when a
 * conversation opens is older and does not. A large clock skew also reads as not live.
 */
export function useArrivedLive(createdAt: string | Date) {
  const [mountedAt] = useState(Date.now);
  return Math.abs(mountedAt - new Date(createdAt).getTime()) < LIVE_WINDOW_MS;
}
