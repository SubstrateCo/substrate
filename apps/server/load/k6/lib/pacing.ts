import { config } from "./config.ts";
import { trace } from "./debug.ts";
import { persona, rng } from "./persona.ts";
import { setTimeout } from "k6/timers";

/**
 * The only place that waits. k6's sleep() blocks the VU's event loop, so socket frames and
 * timers would stall during a pause. These pauses await a timer instead, and hints and
 * refetches run while the user "thinks".
 */

/** Thrown out of a pause when the session's time is up. Only the session loop catches it. */
export class SessionOver extends Error {}

let deadline = Infinity;

/** Sets when the current session ends. Pauses that reach it throw SessionOver. */
export function setDeadline(at: number) {
  deadline = at;
}

const timer = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function wait(ms: number, label: string) {
  const scaled = Math.round(ms * config.pace);
  const remaining = deadline - Date.now();
  if (scaled > 0) trace("pause", `${(scaled / 1000).toFixed(1)}s ${label}`);
  // Backfill keeps a zero delay so pending callbacks still run.
  await timer(Math.max(0, Math.min(scaled, remaining)));
  if (Date.now() >= deadline) throw new SessionOver();
}

/** [median ms, log-normal spread, min ms, max ms] */
const thinkKinds = {
  /** A quick look: a hover, a glance at a badge. */
  glance: [1800, 0.45, 500, 6000],
  /** Moving to another screen or conversation. */
  navigate: [3500, 0.5, 1000, 15_000],
  /** Reading something that is already on screen. */
  read: [9000, 0.6, 2000, 60_000],
  /** Choosing what to do: a reaction, a status, a target. */
  decide: [5500, 0.6, 1200, 30_000],
  /** Gathering thoughts before typing a short reply. */
  composeShort: [4000, 0.6, 800, 25_000],
  /** Gathering thoughts before a long message, task or description. */
  composeLong: [15_000, 0.6, 4000, 90_000],
  /** Between two related actions, such as two messages in a row. */
  between: [7000, 0.7, 1500, 45_000],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type ThinkKind = keyof typeof thinkKinds;

export function think(kind: ThinkKind) {
  const [median, spread, min, max] = thinkKinds[kind];
  return wait(rng.logNormal(median, spread, min, max) * persona.tempo, kind);
}

/**
 * Reading new content: grows with the number of items and their text. Past the first few items
 * people skim, so a long backlog takes sublinearly longer.
 */
export function readTime(itemCount: number, chars = 0) {
  const read = Math.min(itemCount, 6) + 2 * Math.sqrt(Math.max(0, itemCount - 6));
  const share = itemCount > 0 ? read / itemCount : 1;
  const base = 800 + read * 900 + ((chars * share) / persona.readingCps) * 1000;
  const ms = Math.min(90_000, Math.max(1000, base * rng.logNormal(1, 0.3)));
  return wait(ms * persona.tempo, `read ${itemCount} items, ${chars} chars`);
}

/** Typing `text` before it is posted: a start delay, then 4-7 characters per second. */
export function typeTime(text: string) {
  const start = rng.logNormal(1500, 0.5, 300, 8000);
  const typing = (text.length / persona.typingCps) * 1000 * rng.logNormal(1, 0.2);
  return wait(Math.min(150_000, start + typing), `type ${text.length} chars`);
}

/** Sometimes the person is interrupted and steps away for 30-180 s. Resolves whether they did. */
export async function away() {
  if (!rng.chance(persona.awayChance)) return false;
  await wait(Math.exp(rng.between(Math.log(30_000), Math.log(180_000))), "away");
  return true;
}

/** An unscaled wait outside a session (start jitter, time offline). It ignores the deadline. */
export function idle(ms: number, label: string) {
  trace("idle", `${(ms / 1000).toFixed(1)}s ${label}`);
  return timer(Math.max(0, ms));
}
