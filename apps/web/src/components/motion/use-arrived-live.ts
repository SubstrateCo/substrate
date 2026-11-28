import { useState } from "react";

const LIVE_WINDOW_MS = 10_000;

export function useArrivedLive(createdAt: string | Date) {
  const [mountedAt] = useState(Date.now);
  return Math.abs(mountedAt - new Date(createdAt).getTime()) < LIVE_WINDOW_MS;
}
