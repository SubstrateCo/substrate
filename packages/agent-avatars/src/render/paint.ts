import type { Palette } from "../config/resolve.ts";
import { BODY_RADIUS } from "../motion/frame.ts";
import type { ParticleKind } from "../motion/pose.ts";

/** Paint shared by every renderer, so the DOM and native avatars look the same. */

interface GradientStop {
  offset: number;
  color: string;
  opacity?: number;
}

type GradientName = "fill" | "light" | "spec" | "bounce" | "shadow" | "blush" | "eye";

export type GradientSpec =
  | {
      kind: "linear";
      name: GradientName;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stops: GradientStop[];
    }
  /** Centred on the shape's bounding box, as SVG radial gradients are by default. */
  | { kind: "radial"; name: GradientName; stops: GradientStop[] };

const BLUSH = "#ff6f91";

export function gradients(palette: Palette): GradientSpec[] {
  return [
    {
      kind: "linear",
      name: "fill",
      x1: 0.15,
      y1: 0,
      x2: 0.85,
      y2: 1,
      stops: [
        { offset: 0, color: palette.from },
        { offset: 1, color: palette.to },
      ],
    },
    // One layer for both the diffuse light and the shading away from it.
    {
      kind: "radial",
      name: "light",
      stops: [
        { offset: 0, color: "#fff", opacity: 0.5 },
        { offset: 0.12, color: "#fff", opacity: 0.16 },
        { offset: 0.26, color: "#fff", opacity: 0 },
        { offset: 0.36, color: palette.shade, opacity: 0 },
        { offset: 0.56, color: palette.shade, opacity: 0.28 },
        { offset: 0.72, color: palette.shade, opacity: 0.62 },
        { offset: 1, color: palette.shade, opacity: 0.62 },
      ],
    },
    {
      kind: "radial",
      name: "spec",
      stops: [
        { offset: 0, color: "#fff", opacity: 0.95 },
        { offset: 0.45, color: "#fff", opacity: 0.5 },
        { offset: 1, color: "#fff", opacity: 0 },
      ],
    },
    {
      kind: "radial",
      name: "bounce",
      stops: [
        { offset: 0, color: palette.bounce, opacity: 0.5 },
        { offset: 1, color: palette.bounce, opacity: 0 },
      ],
    },
    {
      kind: "radial",
      name: "shadow",
      stops: [
        { offset: 0, color: "#000", opacity: 0.34 },
        { offset: 0.6, color: "#000", opacity: 0.14 },
        { offset: 1, color: "#000", opacity: 0 },
      ],
    },
    {
      kind: "radial",
      name: "blush",
      stops: [
        { offset: 0, color: BLUSH, opacity: 0.6 },
        { offset: 1, color: BLUSH, opacity: 0 },
      ],
    },
    {
      kind: "linear",
      name: "eye",
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 1,
      stops: [
        { offset: 0, color: palette.eye },
        { offset: 1, color: palette.eyeShade },
      ],
    },
  ];
}

/** Fixed sizes of the layers that only move, in view units. */
export const LAYERS = {
  lightRadius: BODY_RADIUS * 2,
  bounce: { rx: BODY_RADIUS * 0.75, ry: BODY_RADIUS * 0.3 },
  spec: { rx: BODY_RADIUS * 0.26, ry: BODY_RADIUS * 0.15, rotate: -32 },
  outlineWidth: 1.2,
  /** The eye shadow sits this far below the eye. */
  eyeShadowOffset: 0.9,
  eyeShadowOpacity: 0.22,
  particleStrokeWidth: 1.6,
} as const;

interface ParticleStyle {
  d: string;
  stroked: boolean;
  /** Marks such as `z` and `?` use the text colour, so they read on light and dark pages. */
  color: string;
}

export const PARTICLES: Record<ParticleKind, ParticleStyle> = {
  z: { d: "M-3 -3.2H3L-3 3.2H3", stroked: true, color: "currentColor" },
  heart: {
    d: "M0 3.4C-.7 2.9-4 .7-4-1.3-4-3-2.7-4-1.6-4-.7-4-.2-3.4 0-2.6.2-3.4.7-4 1.6-4 2.7-4 4-3 4-1.3 4 .7.7 2.9 0 3.4Z",
    stroked: false,
    color: "#ff5d8f",
  },
  question: {
    d: "M-2.6-2.6C-2.6-6 2.8-6 2.8-2.6 2.8-.4 0-.6 0 1.8M0 4.8V4.9",
    stroked: true,
    color: "currentColor",
  },
  exclaim: { d: "M0-5.2V1.4M0 4.6V4.7", stroked: true, color: "currentColor" },
  dots: {
    d: "M-1.6 0A1.6 1.6 0 1 0 1.6 0 1.6 1.6 0 1 0-1.6 0Z",
    stroked: false,
    color: "currentColor",
  },
  sweat: {
    d: "M0-4.2C1.6-1.6 3 .2 3 1.6A3 3 0 0 1-3 1.6C-3 .2-1.6-1.6 0-4.2Z",
    stroked: false,
    color: "#7cc8ff",
  },
};
