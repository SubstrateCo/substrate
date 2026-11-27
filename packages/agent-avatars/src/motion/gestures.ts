import type { Gesture } from "../config/presets.ts";
import type { PoseDelta } from "./pose.ts";

const TAU = Math.PI * 2;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const easeInOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
const bump = (p: number, center: number, width: number) => Math.exp(-(((p - center) / width) ** 2));

/**
 * Internal motions use the same one-shot mechanism as public gestures: reactions (`poke`,
 * `wake`), mood transitions (`settle`, `slump`, `spinBounce`, `spinDizzy`) and ambient
 * behaviour (`lookAround`).
 */
export type Motion =
  | Gesture
  | "poke"
  | "wake"
  | "settle"
  | "slump"
  | "spinBounce"
  | "spinDizzy"
  | "lookAround"
  | "turnAround";

export interface MotionParams {
  /** Where a poke landed, from -1 to 1 across the avatar. */
  x: number;
  y: number;
}

interface MotionSpec {
  /** Seconds. */
  duration: number;
  /** Maps progress from 0 to 1 to offsets on top of the mood pose. */
  delta(p: number, params: MotionParams): PoseDelta;
}

/** Bounces that lose height each time, like a dropped ball. Heights in view units. */
const BOUNCES = [
  { height: 16, seconds: 0.5 },
  { height: 9, seconds: 0.38 },
  { height: 4.5, seconds: 0.27 },
  { height: 2, seconds: 0.18 },
];
const BOUNCE_SECONDS = BOUNCES.reduce((sum, b) => sum + b.seconds, 0);

function bounceAt(seconds: number, scale = 1): PoseDelta {
  let t = seconds;
  for (const { height, seconds: length } of BOUNCES) {
    if (t < length) {
      const phase = t / length;
      const contact = bump(phase, 0, 0.12) + bump(phase, 1, 0.12);
      const squash = (contact * 0.12 * height) / 16;
      return {
        hop: 4 * height * scale * phase * (1 - phase),
        squashY: -squash * scale,
        squashX: squash * 0.8 * scale,
      };
    }
    t -= length;
  }
  return {};
}

/** A full turn about `axis` with a small wind-up the other way first. */
function turn(p: number, axis: "yaw" | "pitch"): PoseDelta {
  const windUp = 0.35;
  const angle =
    p < 0.15
      ? -Math.sin(((p / 0.15) * Math.PI) / 2) * windUp
      : easeInOutCubic((p - 0.15) / 0.85) * (TAU + windUp) - windUp;
  return { [axis]: angle, hop: Math.sin(p * Math.PI) * 4, squashY: Math.sin(p * Math.PI) * 0.04 };
}

function jump(p: number): PoseDelta {
  if (p < 0.18) {
    const s = Math.sin(((p / 0.18) * Math.PI) / 2);
    return { squashY: -0.18 * s, squashX: 0.12 * s };
  }
  if (p < 0.7) {
    const air = Math.sin(((p - 0.18) / 0.52) * Math.PI);
    return {
      hop: air * 16,
      squashY: 0.1 * (1 - air),
      squashX: -0.06 * (1 - air),
      gazeY: -0.3 * air,
    };
  }
  if (p < 0.85) {
    const land = Math.sin(((p - 0.7) / 0.15) * Math.PI);
    return { squashY: -0.16 * land, squashX: 0.12 * land };
  }
  return {};
}

export const MOTIONS: Record<Motion, MotionSpec> = {
  nod: {
    duration: 0.9,
    delta: (p) => {
      const wave = Math.sin(p * TAU * 2) * (1 - p);
      return { pitch: wave * 0.3, gazeY: wave * 0.2 };
    },
  },
  shake: {
    duration: 1,
    delta: (p) => {
      const wave = Math.sin(p * TAU * 2.5) * (1 - p);
      return { yaw: wave * 0.5, gazeX: wave * 0.3 };
    },
  },
  wink: {
    duration: 0.9,
    delta: (p) => {
      const shut = smoothstep(0.1, 0.3, p) * (1 - smoothstep(0.65, 0.85, p));
      return {
        openR: 1 - shut * 0.95,
        roll: -0.1 * shut,
        blush: 0.4 * shut,
        squashY: 0.03 * shut,
      };
    },
  },
  jump: { duration: 1, delta: jump },
  wiggle: {
    duration: 1,
    delta: (p) => {
      const fade = 1 - p;
      const squish = Math.sin(p * TAU * 6) * 0.05 * fade;
      return { roll: Math.sin(p * TAU * 3) * 0.22 * fade, squashX: squish, squashY: -squish };
    },
  },
  peek: {
    duration: 1.8,
    delta: (p) => {
      const e = smoothstep(0, 0.25, p) * (1 - smoothstep(0.75, 1, p));
      return { x: -12 * e, roll: -0.3 * e, yaw: -0.5 * e, gazeX: -0.7 * e, hop: -4 * e };
    },
  },
  spin: { duration: 1.1, delta: (p) => turn(p, "yaw") },
  /** A forward somersault: the face tips down and under, then comes back over the top. */
  flip: { duration: 1.1, delta: (p) => ({ ...turn(p, "pitch"), hop: Math.sin(p * Math.PI) * 9 }) },
  bounce: { duration: BOUNCE_SECONDS, delta: (p) => bounceAt(p * BOUNCE_SECONDS) },
  /** Flies up close to the camera, pulls back into the distance, then settles. */
  swoop: {
    duration: 2.4,
    delta: (p) => {
      const near = bump(p, 0.3, 0.13);
      const far = bump(p, 0.66, 0.13);
      return {
        z: 0.5 * near - 0.3 * far,
        hop: 6 * near - 2 * far,
        x: 5 * near - 6 * far,
        yaw: 0.45 * near - 0.5 * far,
        pitch: -0.15 * near,
        roll: -0.25 * Math.sin(p * TAU) * (1 - p),
        eyeScale: 0.12 * near,
      };
    },
  },
  /**
   * Flies one lap around a horizontal circle: across, behind (small, showing its back) and
   * round to the front again, always facing the way it travels.
   */
  orbit: {
    duration: 3.2,
    delta: (p) => {
      const a = easeInOutSine(p) * TAU;
      return {
        x: 13 * Math.sin(a),
        z: 0.18 * (Math.cos(a) - 1),
        yaw: a,
        hop: 3 * Math.sin(a),
        roll: -0.2 * Math.sin(a),
      };
    },
  },
  spinBounce: {
    duration: 1.6,
    delta: (p) => {
      const t = p * 1.6;
      if (t < 0.7)
        return { yaw: easeInOutCubic(t / 0.7) * TAU, hop: Math.sin((t / 0.7) * Math.PI) * 3 };
      return bounceAt(t - 0.7, 0.6);
    },
  },
  spinDizzy: {
    duration: 2.2,
    delta: (p) => {
      const t = p * 2.2;
      const spinFor = 0.95;
      if (t < spinFor) return { yaw: 3 * TAU * (t / spinFor) ** 2 };
      const s = t - spinFor;
      const envelope = (1 - s / 1.25) ** 1.3;
      return {
        roll: 0.3 * Math.sin(10 * s) * envelope,
        x: 4 * Math.cos(10 * s) * envelope,
        hop: 1.2 * Math.sin(20 * s) * envelope,
        openL: 0.55 + 0.15 * Math.sin(21 * s),
        openR: 0.55 + 0.15 * Math.sin(21 * s + 1),
      };
    },
  },
  /** The beat between moods: a small dip, a blink, and a pop back up. */
  settle: {
    duration: 0.5,
    delta: (p) => {
      const dip = Math.sin(clamp01(p / 0.45) * Math.PI);
      const pop = p > 0.45 ? Math.sin(((p - 0.45) / 0.55) * Math.PI) * (1 - p) : 0;
      const blink = 1 - 0.95 * bump(p, 0.3, 0.11);
      return {
        squashY: -0.07 * dip + 0.06 * pop,
        squashX: 0.05 * dip - 0.03 * pop,
        hop: 2.5 * pop,
        openL: blink,
        openR: blink,
      };
    },
  },
  slump: {
    duration: 0.9,
    delta: (p) => {
      const sag = Math.sin(p * Math.PI);
      return { squashY: -0.12 * sag * (1 - p), squashX: 0.08 * sag * (1 - p), roll: 0.08 * sag };
    },
  },
  /** Turns its back, holds while the body changes, then turns to face front again. */
  turnAround: {
    duration: 1.3,
    delta: (p) => {
      const away = easeInOutCubic(clamp01(p / 0.4));
      const back = easeInOutCubic(clamp01((p - 0.65) / 0.35));
      return { yaw: Math.PI * (away + back), hop: Math.sin(p * Math.PI) * 3 };
    },
  },
  lookAround: {
    duration: 2.4,
    delta: (p) => {
      const look = Math.sin(p * TAU) * Math.sin(p * Math.PI);
      return { yaw: 0.6 * look, gazeX: 0.8 * look, roll: -0.05 * look };
    },
  },
  poke: {
    duration: 0.7,
    delta: (p, { x, y }) => {
      const decay = (1 - p) ** 2;
      const jelly = Math.cos(p * TAU * 2.5) * decay;
      return {
        squashY: -0.16 * jelly,
        squashX: 0.11 * jelly,
        yaw: x * 0.45 * decay,
        pitch: y * 0.35 * decay,
        eyeKind: p < 0.4 ? "squeeze" : undefined,
      };
    },
  },
  wake: {
    duration: 0.8,
    delta: (p) => {
      const up = p < 0.5 ? Math.sin((p / 0.5) * Math.PI) : 0;
      return { hop: up * 7, eyeScale: 0.3 * (1 - p), eyeOpen: 0.2 * (1 - p), squashY: up * 0.06 };
    },
  },
};
