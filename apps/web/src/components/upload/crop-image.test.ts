import { checkImageDimensions } from "./crop-image";
import { expect, test } from "bun:test";

test("image dimensions bound raster memory independently of compressed file size", () => {
  expect(() => checkImageDimensions(8192, 3906)).not.toThrow();
  expect(() => checkImageDimensions(8193, 1)).toThrow("8192");
  expect(() => checkImageDimensions(6000, 6000)).toThrow("32 megapixels");
  expect(() => checkImageDimensions(0, 10)).toThrow();
});
