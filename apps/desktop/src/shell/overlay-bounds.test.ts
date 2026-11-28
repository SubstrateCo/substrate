import { overlayBounds } from "./overlay-bounds.ts";
import { expect, test } from "bun:test";

test("places a full-height column at the top right of the work area", () => {
  expect(overlayBounds({ x: -1920, y: 40, width: 1920, height: 1040 })).toEqual({
    x: -404,
    y: 40,
    width: 404,
    height: 1040,
  });
});

test("never extends past a narrow work area", () => {
  expect(overlayBounds({ x: 0, y: 0, width: 300, height: 600 })).toEqual({
    x: 0,
    y: 0,
    width: 300,
    height: 600,
  });
});
