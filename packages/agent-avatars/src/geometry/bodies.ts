import type { AvatarBody } from "../config/presets.ts";

/**
 * Each body shape is a radial profile: the distance from the centre at evenly spaced angles.
 * Every shape shares the same angles, so two shapes morph by blending their radii.
 */
export const PROFILE_SAMPLES = 72;

const TAU = Math.PI * 2;
const ANGLES = Array.from({ length: PROFILE_SAMPLES }, (_, i) => (i / PROFILE_SAMPLES) * TAU);

type Point = readonly [number, number];
const ORIGIN: Point = [0, 0];

export interface BodyGeometry {
  radii: readonly number[];
  /** Half width, in body radii. */
  extentX: number;
  /** Half height, in body radii. */
  extentY: number;
  /** Distance from the centre to the lowest point, in body radii. */
  bottom: number;
  /** Eye line, from the centre, in body radii. Positive is down. */
  eyeY: number;
}

/** Casts a ray from the origin at each angle and keeps the farthest hit on the outline. */
function radialFromOutline(outline: readonly Point[]): number[] {
  return ANGLES.map((angle) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let farthest = 0;
    for (let j = 0; j < outline.length; j++) {
      const [ax, ay] = outline[j] ?? ORIGIN;
      const [bx, by] = outline[(j + 1) % outline.length] ?? ORIGIN;
      const ex = bx - ax;
      const ey = by - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (ax * ey - ay * ex) / den;
      const s = (ax * dy - ay * dx) / den;
      if (t > 0 && s >= 0 && s <= 1) farthest = Math.max(farthest, t);
    }
    return farthest;
  });
}

function arc(cx: number, cy: number, r: number, start: number, end: number, steps = 10): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = start + ((end - start) * i) / steps;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
}

function roundedPolygon(sides: number, radius: number, corner: number, rotation: number): Point[] {
  const half = Math.PI / sides;
  const inset = corner / Math.cos(half);
  return Array.from({ length: sides }, (_, k) => {
    const vertex = rotation + k * 2 * half;
    const cx = (radius - inset) * Math.cos(vertex);
    const cy = (radius - inset) * Math.sin(vertex);
    return arc(cx, cy, corner, vertex - half, vertex + half);
  }).flat();
}

function capsule(halfWidth: number, halfHeight: number): Point[] {
  const r = Math.min(halfWidth, halfHeight);
  return [
    ...arc(halfWidth - r, 0, r, -Math.PI / 2, Math.PI / 2, 18),
    ...arc(-(halfWidth - r), 0, r, Math.PI / 2, (Math.PI * 3) / 2, 18),
  ];
}

/** A drop with its tip up. */
function teardrop(): Point[] {
  return Array.from({ length: 160 }, (_, i) => {
    const t = (i / 160) * TAU;
    const along = Math.cos(t);
    const across = Math.sin(t) * Math.sin(t / 2) ** 1.25;
    return [across * 0.98, -along] as const;
  });
}

function superellipse(exponent: number): number[] {
  return ANGLES.map(
    (a) =>
      (Math.abs(Math.cos(a)) ** exponent + Math.abs(Math.sin(a)) ** exponent) ** (-1 / exponent),
  );
}

/** Averages each radius with its neighbours, which rounds sharp points such as a drop's tip. */
function soften(radii: number[], passes: number): number[] {
  let out = radii;
  for (let p = 0; p < passes; p++) {
    out = out.map((r, i) => {
      const prev = out[(i - 1 + out.length) % out.length] ?? r;
      const next = out[(i + 1) % out.length] ?? r;
      return (prev + 2 * r + next) / 4;
    });
  }
  return out;
}

function bounds(radii: readonly number[]) {
  let extentX = 0;
  let top = 0;
  let bottom = 0;
  radii.forEach((r, i) => {
    const a = ANGLES[i] ?? 0;
    extentX = Math.max(extentX, Math.abs(r * Math.cos(a)));
    top = Math.max(top, -r * Math.sin(a));
    bottom = Math.max(bottom, r * Math.sin(a));
  });
  return { extentX, top, bottom };
}

function geometry(rawRadii: number[], eyeY: number): BodyGeometry {
  const raw = bounds(rawRadii);
  const scale = 1 / Math.max(raw.extentX, raw.top, raw.bottom);
  const radii = rawRadii.map((r) => r * scale);
  const box = bounds(radii);
  return {
    radii,
    extentX: box.extentX,
    extentY: Math.max(box.top, box.bottom),
    bottom: box.bottom,
    eyeY,
  };
}

/** The blob wobbles over time, so its profile depends on `t` (seconds). */
function blobRadii(t: number): number[] {
  return ANGLES.map(
    (a) =>
      (1 +
        0.05 * Math.sin(3 * a + 0.8 * t + 1) +
        0.035 * Math.sin(5 * a - 1.1 * t + 2) +
        0.03 * Math.sin(2 * a + 0.6 * t + 4)) /
      1.1,
  );
}

const BODY_PROFILES: Record<AvatarBody, BodyGeometry> = {
  circle: geometry(
    ANGLES.map(() => 1),
    -0.04,
  ),
  squircle: geometry(superellipse(4.2), -0.04),
  pill: geometry(radialFromOutline(capsule(1, 0.7)), 0),
  blob: geometry(blobRadii(0), -0.03),
  drop: geometry(soften(radialFromOutline(teardrop()), 3), 0.24),
  hexagon: geometry(radialFromOutline(roundedPolygon(6, 1, 0.22, 0)), 0),
};

export function bodyGeometry(body: AvatarBody): BodyGeometry {
  return BODY_PROFILES[body];
}

/** Profile radii for `body` at time `t` (seconds). Only the blob changes over time. */
export function bodyRadii(body: AvatarBody, t: number): readonly number[] {
  return body === "blob" ? blobRadii(t) : BODY_PROFILES[body].radii;
}

export function profileAngle(index: number): number {
  return ANGLES[index] ?? 0;
}
