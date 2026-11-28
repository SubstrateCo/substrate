import type { AmbientLevel, Mood, World } from "../config/presets.ts";
import type { Motion } from "./gestures.ts";
import type { MoodPose, Pose } from "./pose.ts";

const INTO: Record<Mood, Motion | null> = {
  waiting: "settle",
  listening: "settle",
  thinking: "settle",
  working: "settle",
  searching: "settle",
  reading: "settle",
  writing: "settle",
  focused: "settle",
  happy: "spinBounce",
  love: "spinBounce",
  surprised: null,
  confused: "settle",
  sorry: "slump",
  dizzy: "spinDizzy",
  drowsy: null,
  asleep: null,
};

export function transitionMotion(from: Mood, to: Mood): Motion | null {
  return from === "drowsy" || from === "asleep" ? null : INTO[to];
}

export interface Kick {
  channel: keyof Pose;
  velocity: number;
}

type AmbientPick = { motion: Motion } | { kick: Kick };

interface Ambient {
  every: readonly [number, number];
  picks: readonly AmbientPick[];
  space?: readonly AmbientPick[];
}

const AMBIENT: Partial<Record<Mood, Ambient>> = {
  waiting: {
    every: [6, 12],
    picks: [{ motion: "wink" }, { motion: "lookAround" }, { motion: "lookAround" }],
    space: [{ motion: "swoop" }, { motion: "orbit" }, { motion: "flip" }],
  },
  listening: { every: [4, 7], picks: [{ motion: "nod" }] },
  searching: { every: [4, 7], picks: [{ motion: "spin" }] },
  working: { every: [6, 9], picks: [{ motion: "spin" }], space: [{ motion: "flip" }] },
  happy: {
    every: [4, 8],
    picks: [{ motion: "spinBounce" }, { motion: "wink" }],
    space: [{ motion: "orbit" }],
  },
  love: { every: [5, 9], picks: [{ motion: "wiggle" }] },
  confused: {
    every: [2.6, 4.2],
    picks: [
      { kick: { channel: "roll", velocity: 1.4 } },
      { kick: { channel: "roll", velocity: -1.4 } },
    ],
  },
};

export function ambientDelay(mood: Mood, random: () => number): number {
  const ambient = AMBIENT[mood];
  if (!ambient) return 8;
  const [min, max] = ambient.every;
  return min + random() * (max - min);
}

const BIG_MOTIONS: readonly Motion[] = ["spin", "spinBounce", "swoop", "orbit", "flip"];

export function isSubtle(pick: AmbientPick): boolean {
  return !("motion" in pick) || !BIG_MOTIONS.includes(pick.motion);
}

export function pickAmbient(
  mood: Mood,
  world: World,
  level: AmbientLevel,
  random: () => number,
): AmbientPick | null {
  const ambient = AMBIENT[mood];
  if (!ambient || level === "off") return null;
  const all = world === "space" ? [...ambient.picks, ...(ambient.space ?? [])] : ambient.picks;
  const picks = level === "subtle" ? all.filter(isSubtle) : all;
  return picks[Math.floor(random() * picks.length)] ?? null;
}

export function addFloat(target: MoodPose, t: number, phase: number): void {
  const a = t * 0.53 + phase;
  const b = t * 0.71 + phase * 1.7;
  const c = t * 0.37 + phase * 2.3;
  target.x += 3.5 * Math.sin(a);
  target.hop += 3 * Math.sin(b);
  target.z += 0.07 * Math.sin(c);
  const vx = 3.5 * 0.53 * Math.cos(a);
  const vy = 3 * 0.71 * Math.cos(b);
  target.roll += vx * 0.035;
  target.yaw += vx * 0.06;
  target.pitch -= vy * 0.035;
}
