import { config } from "./config.ts";

const enabled = config.debugVu > 0 && __VU === config.debugVu;
const start = Date.now();
let last = start;

/** Prints one line of the traced VU's timeline: time since VU start, gap since the last line. */
export function trace(kind: string, text: string) {
  if (!enabled) return;
  const now = Date.now();
  const at = ((now - start) / 1000).toFixed(1).padStart(7);
  const gap = ((now - last) / 1000).toFixed(1).padStart(6);
  last = now;
  console.log(`[vu ${__VU}] ${at}s +${gap}s ${kind.padEnd(8)} ${text}`);
}
