import type { EyeStyle } from "../config/presets.ts";
import { fmt } from "./path.ts";

export interface EyeDimensions {
  w: number;
  h: number;
  round: number;
  spread: number;
  scaleL: number;
  scaleR: number;
}

export const EYE_DIMENSIONS: Record<EyeStyle, EyeDimensions> = {
  round: { w: 0.24, h: 0.24, round: 1, spread: 0.36, scaleL: 1, scaleR: 1 },
  tall: { w: 0.19, h: 0.34, round: 1, spread: 0.34, scaleL: 1, scaleR: 1 },
  wide: { w: 0.3, h: 0.19, round: 1, spread: 0.39, scaleL: 1, scaleR: 1 },
  dot: { w: 0.15, h: 0.15, round: 1, spread: 0.32, scaleL: 1, scaleR: 1 },
  square: { w: 0.25, h: 0.25, round: 0.42, spread: 0.37, scaleL: 1, scaleR: 1 },
  curious: { w: 0.24, h: 0.24, round: 1, spread: 0.36, scaleL: 1.22, scaleR: 0.84 },
};

const KAPPA = 0.5523;

function corner(px: number, py: number, bx: number, by: number, ax: number, ay: number) {
  return `C${fmt(ax + (px - ax) * KAPPA)} ${fmt(ay + (py - ay) * KAPPA)} ${fmt(bx + (px - bx) * KAPPA)} ${fmt(by + (py - by) * KAPPA)} ${fmt(bx)} ${fmt(by)}`;
}

export function openEyePath(
  cx: number,
  cy: number,
  w: number,
  h: number,
  round: number,
  lidLeft: number,
  lidRight: number,
): string {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y1 = cy + h / 2;
  const topLeft = cy - h / 2 + lidLeft * h;
  const topRight = cy - h / 2 + lidRight * h;
  const r = Math.max(
    0,
    Math.min((Math.min(w, h) / 2) * round, (y1 - Math.max(topLeft, topRight)) / 2, w / 2),
  );
  const slope = (topRight - topLeft) / w;
  return [
    `M${fmt(x0)} ${fmt(topLeft + r)}`,
    corner(x0, topLeft, x0 + r, topLeft + slope * r, x0, topLeft + r),
    `L${fmt(x1 - r)} ${fmt(topRight - slope * r)}`,
    corner(x1, topRight, x1, topRight + r, x1 - r, topRight - slope * r),
    `L${fmt(x1)} ${fmt(y1 - r)}`,
    corner(x1, y1, x1 - r, y1, x1, y1 - r),
    `L${fmt(x0 + r)} ${fmt(y1)}`,
    corner(x0, y1, x0, y1 - r, x0 + r, y1),
    "Z",
  ].join("");
}

export function arcEyePath(cx: number, cy: number, w: number, bulge: number): string {
  return `M${fmt(cx - w / 2)} ${fmt(cy + bulge * 0.3)}Q${fmt(cx)} ${fmt(cy - bulge)} ${fmt(cx + w / 2)} ${fmt(cy + bulge * 0.3)}`;
}

export function chevronEyePath(cx: number, cy: number, w: number, h: number, pointsRight: boolean) {
  const dir = pointsRight ? 1 : -1;
  return `M${fmt(cx - (dir * w) / 2)} ${fmt(cy - h / 2)}L${fmt(cx + (dir * w) / 2)} ${fmt(cy)}L${fmt(cx - (dir * w) / 2)} ${fmt(cy + h / 2)}`;
}

export function heartPath(cx: number, cy: number, size: number): string {
  const p = (x: number, y: number) => `${fmt(cx + x * size)} ${fmt(cy + y * size)}`;
  return [
    `M${p(0, 0.42)}`,
    `C${p(-0.08, 0.36)} ${p(-0.5, 0.08)} ${p(-0.5, -0.16)}`,
    `C${p(-0.5, -0.38)} ${p(-0.34, -0.5)} ${p(-0.2, -0.5)}`,
    `C${p(-0.08, -0.5)} ${p(-0.02, -0.42)} ${p(0, -0.32)}`,
    `C${p(0.02, -0.42)} ${p(0.08, -0.5)} ${p(0.2, -0.5)}`,
    `C${p(0.34, -0.5)} ${p(0.5, -0.38)} ${p(0.5, -0.16)}`,
    `C${p(0.5, 0.08)} ${p(0.08, 0.36)} ${p(0, 0.42)}Z`,
  ].join("");
}

export function spiralPath(cx: number, cy: number, radius: number, angle: number): string {
  const turns = Math.PI * 3.2;
  const steps = 22;
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * turns;
    const r = (radius * i) / steps;
    return `${fmt(cx + r * Math.cos(t + angle))} ${fmt(cy + r * Math.sin(t + angle))}`;
  });
  return `M${points.join("L")}`;
}
