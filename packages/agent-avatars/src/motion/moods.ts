import type { Mood } from "../config/presets.ts";
import type { Noise } from "./noise.ts";
import type { MoodPose } from "./pose.ts";

const TAU = Math.PI * 2;

const deadzone = (value: number, zone: number) => (Math.abs(value) < zone ? 0 : value);
/** A soft square wave between -1 and 1. */
const sway = (t: number, period: number, sharpness = 3) =>
  Math.tanh(sharpness * Math.sin((t * TAU) / period));
const bump = (p: number, center: number, width: number) => Math.exp(-(((p - center) / width) ** 2));

type MoodTarget = (t: number, noise: Noise) => Partial<MoodPose>;

/**
 * Each mood maps the seconds since it started to a target pose. Springs chase the target,
 * so these functions can jump (a glance, a saccade) and still look smooth.
 */
export const MOOD_TARGETS: Record<Mood, MoodTarget> = {
  waiting(t, noise) {
    const gazeX = deadzone(noise.step(1, t, 2.6), 0.35) * 0.75;
    const gazeY = deadzone(noise.step(2, t, 3.3), 0.5) * 0.45;
    const breath = Math.sin((t * TAU) / 3.4);
    return {
      gazeX,
      gazeY,
      yaw: gazeX * 0.3 + noise.smooth(3, t * 0.3) * 0.05,
      pitch: gazeY * 0.2,
      roll: noise.smooth(4, t * 0.25) * 0.05,
      squashY: 1 + breath * 0.015,
      squashX: 1 - breath * 0.01,
      attentive: true,
    };
  },
  listening(t, noise) {
    const nod = Math.max(0, Math.sin(t * 2.2)) ** 6;
    return {
      gazeX: noise.smooth(1, t * 0.4) * 0.2,
      gazeY: 0.5,
      pitch: 0.2 + nod * 0.12,
      yaw: noise.smooth(2, t * 0.3) * 0.08,
      eyeScale: 1.08,
      scale: 1.02,
    };
  },
  thinking(t) {
    const side = sway(t, 5.5);
    return {
      gazeX: 0.5 * side,
      gazeY: -0.65,
      yaw: 0.22 * side,
      pitch: -0.16,
      roll: Math.sin(t * 1.1) * 0.1 - side * 0.04,
      eyeOpen: 0.86,
      particles: "dots",
    };
  },
  working(t) {
    const a = t * 4.2;
    return {
      gazeX: Math.cos(a) * 0.55,
      gazeY: Math.sin(a) * 0.45,
      yaw: Math.cos(a) * 0.12,
      pitch: Math.sin(a) * 0.08,
      hop: Math.abs(Math.sin((t * TAU) / 1.6)) * 1.2,
      eyeOpen: 0.9,
      blinks: false,
    };
  },
  searching(t, noise) {
    const side = sway(t, 2.4, 2.5);
    return {
      gazeX: side * 0.85,
      gazeY: 0.05 + noise.smooth(1, t * 0.5) * 0.15,
      yaw: side * 0.55,
      roll: -side * 0.04,
      eyeScale: 1.06,
    };
  },
  reading(t) {
    const line = 1.5;
    const lines = 4;
    const cycle = t % (line * lines + 0.6);
    if (cycle >= line * lines) return { gazeX: -0.6, gazeY: -0.25, pitch: 0.1, yaw: -0.07 };
    const index = Math.floor(cycle / line);
    const progress = (cycle - index * line) / line;
    const gazeX = -0.6 + 1.2 * Math.min(1, Math.floor(progress * 5) / 4);
    const gazeY = -0.25 + index * 0.22;
    return { gazeX, gazeY, pitch: 0.12 + gazeY * 0.1, yaw: gazeX * 0.12 };
  },
  writing(t) {
    const progress = (t % 2.2) / 2.2;
    const gazeX = -0.45 + 0.9 * progress + Math.sin(t * 22) * 0.03;
    return {
      gazeX,
      gazeY: 0.55,
      pitch: 0.24,
      yaw: gazeX * 0.1,
      roll: Math.sin(t * 3) * 0.02,
      eyeOpen: 0.9,
      hop: Math.max(0, Math.sin((t * TAU) / 0.55)) * 0.6,
    };
  },
  focused(t, noise) {
    return {
      gazeX: noise.smooth(1, t * 0.25) * 0.08,
      gazeY: 0.05,
      lidInner: 0.42,
      lidOuter: 0.3,
      scale: 1.05,
      pitch: 0.08,
    };
  },
  happy(t) {
    const phase = (t % 0.95) / 0.95;
    const hop = phase < 0.55 ? Math.sin((phase / 0.55) * Math.PI) * 6 : 0;
    const land = phase >= 0.55 && phase < 0.75 ? Math.sin(((phase - 0.55) / 0.2) * Math.PI) : 0;
    const squashY = 1 + hop * 0.006 - land * 0.08;
    return {
      eyeKind: "happy",
      hop,
      squashY,
      squashX: 2 - squashY,
      roll: Math.sin((t * TAU) / 1.9) * 0.08,
      blush: 0.7,
      blinks: false,
      attentive: true,
    };
  },
  love(t) {
    const p = (t % 1.1) / 1.1;
    const beat = bump(p, 0.08, 0.06) + 0.6 * bump(p, 0.28, 0.06);
    return {
      eyeKind: "heart",
      eyeScale: 1.1 + beat * 0.2,
      roll: Math.sin(t * 1.6) * 0.1,
      hop: 2 + Math.sin(t * 2.2) * 1.5,
      gazeY: -0.1,
      blush: 1,
      blinks: false,
      attentive: true,
      particles: "heart",
    };
  },
  surprised(t) {
    const jump = t < 0.45 ? Math.sin((t / 0.45) * Math.PI) : 0;
    return {
      hop: jump * 9,
      squashY: 1 + jump * 0.1,
      squashX: 1 - jump * 0.07,
      eyeScale: 1.32,
      eyeOpen: 1.1,
      pitch: -0.1,
      scale: 1.03,
      blinks: t > 2.2,
      attentive: true,
      particles: t < 1.6 ? "exclaim" : null,
    };
  },
  confused(t, noise) {
    const swap = sway(t, 2.6);
    return {
      roll: 0.17 + Math.sin(t * 0.9) * 0.04,
      eyeScaleL: 1 + 0.2 * swap,
      eyeScaleR: 1 - 0.2 * swap,
      gazeX: noise.smooth(1, t * 0.6) * 0.35,
      gazeY: -0.15 + noise.smooth(2, t * 0.5) * 0.15,
      yaw: noise.smooth(3, t * 0.4) * 0.18,
      particles: "question",
    };
  },
  sorry(t, noise) {
    return {
      lidOuter: 0.5,
      lidInner: 0.05,
      gazeX: noise.smooth(1, t * 0.3) * 0.12,
      gazeY: 0.6,
      pitch: 0.26,
      hop: -2.5,
      squashY: 0.95 + Math.sin((t * TAU) / 4) * 0.01,
      squashX: 1.04,
      eyeOpen: 0.85,
      particles: "sweat",
    };
  },
  dizzy(t) {
    return {
      eyeKind: "spiral",
      eyeSpin: t * 7,
      roll: Math.sin(t * 3.2) * 0.2,
      yaw: Math.cos(t * 3.2) * 0.22,
      pitch: Math.sin(t * 3.2) * 0.12,
      x: Math.sin(t * 1.6) * 2.5,
      blinks: false,
    };
  },
  drowsy(t) {
    const p = (t % 3.6) / 3.6;
    const droop = p < 0.85 ? (p / 0.85) ** 2 : 1 - (p - 0.85) / 0.15;
    return {
      eyeOpen: 0.6 - droop * 0.5,
      lidInner: 0.15,
      lidOuter: 0.15,
      pitch: 0.05 + droop * 0.22,
      gazeY: 0.25,
      roll: droop * 0.06,
      squashY: 1 + Math.sin((t * TAU) / 4.2) * 0.02,
      blinks: false,
    };
  },
  asleep(t) {
    const breath = Math.sin((t * TAU) / 4.6);
    return {
      eyeKind: "closed",
      gazeY: 0.3,
      pitch: 0.14,
      roll: 0.07,
      hop: -1.5,
      squashY: 1 + breath * 0.035,
      squashX: 1 - breath * 0.02,
      blinks: false,
      particles: "z",
    };
  },
};
