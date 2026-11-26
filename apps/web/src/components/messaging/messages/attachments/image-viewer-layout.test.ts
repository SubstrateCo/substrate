import { fitViewerImage } from "./image-viewer-layout";
import { describe, expect, test } from "bun:test";

describe("image viewer bounds", () => {
  const image = { width: 1600, height: 900 };
  const viewport = { width: 1000, height: 600 };

  test("fits the full image without changing its aspect ratio", () => {
    expect(fitViewerImage(image, viewport, 0, 1)).toEqual({
      imageWidth: 1000,
      imageHeight: 562.5,
      width: 1000,
      height: 600,
    });
  });

  test("fits quarter turns by their rotated dimensions", () => {
    for (const rotation of [90, 270]) {
      expect(fitViewerImage(image, viewport, rotation, 1)).toEqual({
        imageWidth: 600,
        imageHeight: 337.5,
        width: 1000,
        height: 600,
      });
    }
  });

  test("allocates scroll space for zoomed rotated images", () => {
    expect(fitViewerImage(image, viewport, 90, 4)).toEqual({
      imageWidth: 2400,
      imageHeight: 1350,
      width: 1350,
      height: 2400,
    });
  });

  test("does not upscale small images until the viewer zooms", () => {
    expect(fitViewerImage({ width: 200, height: 100 }, viewport, 180, 1).imageWidth).toBe(200);
  });
});
