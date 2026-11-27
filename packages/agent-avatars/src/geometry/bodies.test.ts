import { BODIES } from "../config/presets.ts";
import { PROFILE_SAMPLES, profileAngle, bodyGeometry } from "./bodies.ts";
import { describe, expect, test } from "bun:test";

describe("bodyGeometry", () => {
  test.each([...BODIES])("%s fits the unit box and has no collapsed points", (body) => {
    const { radii, extentX, extentY } = bodyGeometry(body);
    expect(radii).toHaveLength(PROFILE_SAMPLES);
    expect(Math.max(extentX, extentY)).toBeCloseTo(1, 2);
    expect(Math.min(...radii)).toBeGreaterThan(0.5);
  });

  test("the pill is wider than it is tall", () => {
    const { extentX, extentY } = bodyGeometry("pill");
    expect(extentX / extentY).toBeCloseTo(1 / 0.7, 1);
  });

  test("the drop's tip points up", () => {
    const { radii } = bodyGeometry("drop");
    const top = radii.findIndex((_, i) => Math.abs(profileAngle(i) - (Math.PI * 3) / 2) < 1e-9);
    const side = 0;
    expect(radii[top]).toBeGreaterThan(radii[side] ?? 0);
  });

  test("the hexagon has six-fold symmetry", () => {
    const { radii } = bodyGeometry("hexagon");
    const sixth = PROFILE_SAMPLES / 6;
    radii.forEach((r, i) => {
      expect(r).toBeCloseTo(radii[(i + sixth) % PROFILE_SAMPLES] ?? 0, 3);
    });
  });
});
