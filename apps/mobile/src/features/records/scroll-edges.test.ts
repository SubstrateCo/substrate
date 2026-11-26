import { scrollEdges } from "./scroll-edges";
import { describe, expect, test } from "bun:test";

describe("scrollEdges", () => {
  test("hides nothing when the content fits", () => {
    expect(scrollEdges({ offset: 0, viewport: 300, content: 300 })).toEqual({
      start: false,
      end: false,
    });
  });

  test("hides nothing before the row is measured", () => {
    expect(scrollEdges({ offset: 0, viewport: 0, content: 500 })).toEqual({
      start: false,
      end: false,
    });
  });

  test("hides only the end at the start of an overflowing row", () => {
    expect(scrollEdges({ offset: 0, viewport: 300, content: 500 })).toEqual({
      start: false,
      end: true,
    });
  });

  test("hides both sides in the middle of the row", () => {
    expect(scrollEdges({ offset: 100, viewport: 300, content: 500 })).toEqual({
      start: true,
      end: true,
    });
  });

  test("hides only the start at the end of the row, despite sub-pixel rounding", () => {
    expect(scrollEdges({ offset: 199.6, viewport: 300, content: 500 })).toEqual({
      start: true,
      end: false,
    });
  });

  test("hides only the start when overscrolled past the end", () => {
    expect(scrollEdges({ offset: 230, viewport: 300, content: 500 })).toEqual({
      start: true,
      end: false,
    });
  });
});
