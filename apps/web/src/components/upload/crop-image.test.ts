import { checkImageDimensions, cropImage, pictureErrorMessage } from "./crop-image";
import { expect, mock, test } from "bun:test";

test("image dimensions bound raster memory independently of compressed file size", () => {
  expect(() => checkImageDimensions(8192, 3906)).not.toThrow();
  expect(() => checkImageDimensions(8193, 1)).toThrow("8192");
  expect(() => checkImageDimensions(6000, 6000)).toThrow("32 megapixels");
  expect(() => checkImageDimensions(0, 10)).toThrow();
});

test("only picture limits reach the user; other failures show the fallback", () => {
  let limit = new Error("checkImageDimensions did not throw");
  try {
    checkImageDimensions(8193, 1);
  } catch (error) {
    if (error instanceof Error) limit = error;
  }
  expect(pictureErrorMessage(limit)).toContain("8192 pixels");
  expect(pictureErrorMessage(new Error("DOMException: decode failed"))).toBe(
    "This image could not be opened.",
  );
});

const picture = () =>
  new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "crop.png", { type: "image/png" });

test("a cancelled crop does not start decoding", async () => {
  const controller = new AbortController();
  controller.abort();
  expect(
    await cropImage(picture(), null, 0, "fit", controller.signal).catch((error) => error),
  ).toBe(controller.signal.reason);
});

test("cancelling during decode releases the bitmap without starting canvas work", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "createImageBitmap");
  const controller = new AbortController();
  const close = mock(() => {});
  const cancellation = new DOMException("Aborted", "AbortError");
  Object.defineProperty(globalThis, "createImageBitmap", {
    configurable: true,
    value: async () => {
      controller.abort(cancellation);
      return { width: 512, height: 512, close };
    },
  });
  try {
    expect(
      await cropImage(picture(), null, 0, "fit", controller.signal).catch((error) => error),
    ).toBe(cancellation);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    if (original) Object.defineProperty(globalThis, "createImageBitmap", original);
    else Reflect.deleteProperty(globalThis, "createImageBitmap");
  }
});
