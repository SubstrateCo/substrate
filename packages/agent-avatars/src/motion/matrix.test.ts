import { compose, rotation, scaling, translation, type Matrix } from "./matrix.ts";
import { describe, expect, test } from "bun:test";

const apply = ([a, b, c, d, e, f]: Matrix, x: number, y: number) => ({
  x: a * x + c * y + e,
  y: b * x + d * y + f,
});

describe("compose", () => {
  test("applies the last transform to points first, like an SVG transform list", () => {
    expect(apply(compose(translation(10, 0), rotation(90)), 1, 0)).toEqual({ x: 10, y: 1 });
    expect(apply(compose(rotation(90), translation(10, 0)), 1, 0)).toEqual({ x: 0, y: 11 });
  });

  test("scales about a pivot when wrapped in opposite translations", () => {
    const aboutFloor = compose(translation(0, 30), scaling(2, 0.5), translation(0, -30));
    expect(apply(aboutFloor, 0, 30)).toEqual({ x: 0, y: 30 });
    expect(apply(aboutFloor, 5, 10)).toEqual({ x: 10, y: 20 });
  });
});
