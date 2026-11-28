import { profileAngle } from "./bodies.ts";

export function fmt(value: number): number {
  return Math.round(value * 100) / 100;
}

export function radialPath(radii: readonly number[], radius: number): string {
  const count = radii.length;
  const xs = Array.from<number>({ length: count });
  const ys = Array.from<number>({ length: count });
  for (let i = 0; i < count; i++) {
    const a = profileAngle(i);
    const r = (radii[i] ?? 0) * radius;
    xs[i] = r * Math.cos(a);
    ys[i] = r * Math.sin(a);
  }
  const x = (i: number) => xs[(i + count) % count] ?? 0;
  const y = (i: number) => ys[(i + count) % count] ?? 0;
  const parts = [`M${fmt(x(0))} ${fmt(y(0))}`];
  for (let i = 0; i < count; i++) {
    const c1x = x(i) + (x(i + 1) - x(i - 1)) / 6;
    const c1y = y(i) + (y(i + 1) - y(i - 1)) / 6;
    const c2x = x(i + 1) - (x(i + 2) - x(i)) / 6;
    const c2y = y(i + 1) - (y(i + 2) - y(i)) / 6;
    parts.push(
      `C${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(x(i + 1))} ${fmt(y(i + 1))}`,
    );
  }
  parts.push("Z");
  return parts.join("");
}
