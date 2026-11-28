import type { EyeStyle, World } from "../config/presets.ts";
import type { BodyGeometry } from "../geometry/bodies.ts";
import {
  arcEyePath,
  chevronEyePath,
  EYE_DIMENSIONS,
  heartPath,
  openEyePath,
  spiralPath,
} from "../geometry/eyes.ts";
import { fmt } from "../geometry/path.ts";
import { compose, rotation, scaling, translation, type Matrix } from "./matrix.ts";
import type { EyeKind, ParticleKind, Pose } from "./pose.ts";

export const VIEW_BOX = "-50 -50 100 100";
export const BODY_RADIUS = 33;
const CENTER_Y = 1;

export interface EyeFrame {
  d: string;
  stroked: boolean;
  strokeWidth: number;
  opacity: number;
  glint: { x: number; y: number; r: number; opacity: number };
}

export interface ParticleFrame {
  kind: ParticleKind;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
}

export interface Frame {
  body: string;
  transform: string;
  matrix: Matrix;
  light: { x: number; y: number };
  spec: { x: number; y: number };
  bounce: { x: number; y: number };
  shadow: { cx: number; cy: number; rx: number; ry: number; opacity: number };
  eyes: [EyeFrame, EyeFrame];
  cheeks: { x: number; y: number; rx: number; ry: number; opacity: number }[];
  particles: ParticleFrame[];
}

export interface FrameInput {
  body: string;
  geometry: BodyGeometry;
  eyes: EyeStyle;
  world: World;
  pose: Pose;
  eyeKind: EyeKind;
  eyeSpin: number;
  openL: number;
  openR: number;
  eyeLift: number;
  particles: ParticleKind | null;
  particleAge: number;
  t: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function rotate(x: number, y: number, angle: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: fmt(x * c - y * s), y: fmt(x * s + y * c) };
}

interface SurfacePoint {
  x: number;
  y: number;
  z: number;
  fx: number;
  fy: number;
}

function project(lon: number, lat: number, ax: number, ay: number): SurfacePoint {
  const cosLat = Math.cos(lat);
  return {
    x: ax * Math.sin(lon) * cosLat,
    y: ay * Math.sin(lat),
    z: Math.cos(lon) * cosLat,
    fx: Math.max(0, Math.cos(lon)) ** 0.8,
    fy: Math.max(0, Math.cos(lat)),
  };
}

const NO_GLINT = { x: 0, y: 0, r: 0, opacity: 0 };

interface EyeDraw {
  kind: EyeKind;
  cx: number;
  cy: number;
  w: number;
  h: number;
  fullH: number;
  round: number;
  lidLeft: number;
  lidRight: number;
  side: -1 | 1;
  spin: number;
}

function drawEye(e: EyeDraw): Omit<EyeFrame, "opacity"> {
  const line = Math.max(1.8, e.w * 0.34);
  const size = Math.max(e.w, e.fullH);
  switch (e.kind) {
    case "closed":
      return {
        d: arcEyePath(e.cx, e.cy + e.fullH * 0.15, e.w * 1.1, -e.fullH * 0.22),
        stroked: true,
        strokeWidth: line,
        glint: NO_GLINT,
      };
    case "happy":
      return {
        d: arcEyePath(e.cx, e.cy, e.w * 1.15, size * 0.42 * Math.min(1, e.h / e.fullH + 0.2)),
        stroked: true,
        strokeWidth: line,
        glint: NO_GLINT,
      };
    case "squeeze":
      return {
        d: chevronEyePath(e.cx, e.cy, e.w * 0.8, e.fullH * 0.62, e.side < 0),
        stroked: true,
        strokeWidth: line,
        glint: NO_GLINT,
      };
    case "spiral":
      return {
        d: spiralPath(e.cx, e.cy, size * 0.5, e.spin * e.side),
        stroked: true,
        strokeWidth: line * 0.7,
        glint: NO_GLINT,
      };
    case "heart": {
      const heart = size * 1.25 * Math.min(1, e.h / e.fullH + 0.15);
      return {
        d: heartPath(e.cx, e.cy, heart),
        stroked: false,
        strokeWidth: 0,
        glint: {
          x: fmt(e.cx - heart * 0.2),
          y: fmt(e.cy - heart * 0.2),
          r: fmt(heart * 0.09),
          opacity: 0.85,
        },
      };
    }
    case "open":
      return {
        d: openEyePath(e.cx, e.cy, e.w, e.h, e.round, e.lidLeft, e.lidRight),
        stroked: false,
        strokeWidth: 0,
        glint: {
          x: fmt(e.cx - e.w * 0.2),
          y: fmt(e.cy - e.h * 0.22 + (e.lidLeft + e.lidRight) * e.h * 0.25),
          r: fmt(Math.min(e.w, e.h) * 0.15),
          opacity: e.h > e.fullH * 0.45 ? 0.85 : 0,
        },
      };
  }
}

const PARTICLE_COUNT = 3;

function particleFrames(
  kind: ParticleKind | null,
  t: number,
  age: number,
  headX: number,
  headY: number,
): ParticleFrame[] {
  if (!kind) return [];
  const fade = smoothstep(0, 0.35, age);
  const R = BODY_RADIUS;
  const frames: ParticleFrame[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const frame = particle(kind, i, t, age, headX, headY, R);
    if (frame) frames.push({ ...frame, opacity: fmt(frame.opacity * fade) });
  }
  return frames;
}

function particle(
  kind: ParticleKind,
  i: number,
  t: number,
  age: number,
  hx: number,
  hy: number,
  R: number,
): ParticleFrame | null {
  const rising = (period: number) => (t / period + i / PARTICLE_COUNT) % 1;
  switch (kind) {
    case "z": {
      const p = rising(3);
      return {
        kind,
        x: hx + R * 0.5 + p * 12 + Math.sin(p * 6) * 1.5,
        y: hy - R * 0.85 - p * 16,
        scale: 0.5 + 0.7 * p,
        rotate: -12,
        opacity: Math.sin(p * Math.PI) * 0.9,
      };
    }
    case "heart": {
      const p = rising(2.4);
      const side = i % 2 === 0 ? 1 : -1;
      return {
        kind,
        x: hx + side * R * 0.62 + Math.sin(p * 8 + i) * 2,
        y: hy - R * 0.55 - p * 20,
        scale: 0.6 + 0.5 * p,
        rotate: side * 12,
        opacity: Math.sin(p * Math.PI),
      };
    }
    case "dots": {
      const pulse = Math.max(0, Math.sin(t * 3 - i * 0.8));
      return {
        kind,
        x: hx + R * 0.62 + i * 5,
        y: hy - R * 0.78 - i * 6,
        scale: 0.55 + i * 0.25,
        rotate: 0,
        opacity: 0.35 + 0.65 * pulse,
      };
    }
    case "question":
      if (i > 0) return null;
      return {
        kind,
        x: hx + R * 0.7,
        y: hy - R * 0.95 + Math.sin(t * 2) * 1.5,
        scale: 1,
        rotate: Math.sin(t * 1.5) * 12,
        opacity: 1,
      };
    case "exclaim": {
      if (i > 0) return null;
      const pop = Math.min(1, age * 5);
      return {
        kind,
        x: hx + R * 0.72,
        y: hy - R * 0.92,
        scale: pop * (1 + Math.sin(pop * Math.PI) * 0.4),
        rotate: 10,
        opacity: 1,
      };
    }
    case "sweat": {
      if (i > 0) return null;
      const p = (t / 2.2) % 1;
      return {
        kind,
        x: hx - R * 0.74,
        y: hy - R * 0.45 + p * 7,
        scale: 0.9,
        rotate: 0,
        opacity: Math.sin(p * Math.PI),
      };
    }
  }
}

export function buildFrame(input: FrameInput): Frame {
  const { pose, geometry } = input;
  const R = BODY_RADIUS;
  const bottom = geometry.bottom * R;
  const baseY = CENTER_Y + (1 - geometry.bottom) * R * 0.5;
  const depth = Math.max(0.2, 1 + pose.z);
  const sx = pose.squashX * pose.scale * depth;
  const sy = pose.squashY * pose.scale * depth;
  const roll = pose.roll;
  const centerY = baseY - pose.hop;
  const transform = `translate(${fmt(pose.x)} ${fmt(centerY)}) rotate(${fmt((roll * 180) / Math.PI)}) translate(0 ${fmt(bottom)}) scale(${fmt(sx)} ${fmt(sy)}) translate(0 ${fmt(-bottom)})`;
  const matrix = compose(
    translation(fmt(pose.x), fmt(centerY)),
    rotation(fmt((roll * 180) / Math.PI)),
    translation(0, fmt(bottom)),
    scaling(fmt(sx), fmt(sy)),
    translation(0, fmt(-bottom)),
  );

  const ax = R * geometry.extentX * 0.96;
  const ay = R * geometry.extentY * 0.96;
  const dims = EYE_DIMENSIONS[input.eyes];
  const lon0 = Math.asin(clamp(dims.spread, -0.95, 0.95));
  const lat0 = Math.asin(clamp(geometry.eyeY / geometry.extentY, -0.9, 0.9));
  const lonShift = pose.gazeX * 0.34 + pose.yaw;
  const latShift = pose.gazeY * 0.3 + pose.pitch;

  const eye = (side: -1 | 1): EyeFrame => {
    const p = project(side * lon0 + lonShift, lat0 + latShift, ax, ay);
    const scale =
      pose.eyeScale * (side < 0 ? pose.eyeScaleL * dims.scaleL : pose.eyeScaleR * dims.scaleR);
    const open = Math.max(0, pose.eyeOpen) * (side < 0 ? input.openL : input.openR);
    const w = dims.w * R * scale * p.fx;
    const fullH = dims.h * R * scale * p.fy;
    const drawn = drawEye({
      kind: input.eyeKind,
      cx: p.x,
      cy: p.y - input.eyeLift,
      w,
      h: Math.max(fullH * open, 1.1),
      fullH,
      round: dims.round,
      lidLeft: clamp(side < 0 ? pose.lidOuter : pose.lidInner, 0, 0.9),
      lidRight: clamp(side < 0 ? pose.lidInner : pose.lidOuter, 0, 0.9),
      side,
      spin: input.eyeSpin,
    });
    return { ...drawn, opacity: fmt(smoothstep(0.05, 0.3, p.z)) };
  };

  const cheek = (side: -1 | 1) => {
    const p = project(side * (lon0 + 0.24) + lonShift, lat0 + 0.38 + latShift, ax, ay);
    return {
      x: fmt(p.x),
      y: fmt(p.y),
      rx: fmt(R * 0.15 * p.fx),
      ry: fmt(R * 0.09 * p.fy),
      opacity: fmt(clamp(pose.blush, 0, 1) * smoothstep(0.05, 0.3, p.z)),
    };
  };

  const lift = Math.max(0, pose.hop);
  const shadowScale = 1 - Math.min(0.6, lift / 40);
  const R2 = geometry.extentX * R;

  return {
    body: input.body,
    transform,
    matrix,
    light: rotate(-0.34 * R2, -0.46 * R, -roll),
    spec: rotate(-0.32 * R2, -0.6 * geometry.extentY * R, -roll),
    bounce: rotate(0, bottom * 0.9, -roll),
    shadow: {
      cx: fmt(pose.x * 0.9),
      cy: fmt(baseY + bottom + 3),
      rx: fmt(R2 * 0.88 * shadowScale * pose.squashX),
      ry: fmt(4.6 * shadowScale),
      opacity: input.world === "space" ? 0 : fmt(0.9 * shadowScale ** 2),
    },
    eyes: [eye(-1), eye(1)],
    cheeks: [cheek(-1), cheek(1)],
    particles: particleFrames(input.particles, input.t, input.particleAge, pose.x, centerY),
  };
}
