/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import sharp from "sharp";
import { normalizePicture } from "./image";

test("pictures are decoded and reencoded, stripping metadata and bounding dimensions", async () => {
  const input = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "red" },
  })
    .png()
    .withExif({ IFD0: { Artist: "private" } })
    .toBuffer();
  const result = await normalizePicture(input, "image/png");
  const metadata = await sharp(result).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(1024);
  expect(metadata.exif).toBeUndefined();
});

test("pictures reject non-images, MIME spoofing, SVG, animation, and excessive pixels", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  await expect(normalizePicture(png, "image/jpeg")).rejects.toThrow();
  await expect(
    normalizePicture(new TextEncoder().encode("not an image"), "image/png"),
  ).rejects.toThrow();
  await expect(
    normalizePicture(
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      ),
      "image/png",
    ),
  ).rejects.toThrow();
  const frames = Buffer.from([
    ...Array.from({ length: 4 }, () => [255, 0, 0, 255]).flat(),
    ...Array.from({ length: 4 }, () => [0, 0, 255, 255]).flat(),
  ]);
  const animation = await sharp(frames, {
    raw: { width: 2, height: 4, channels: 4, pageHeight: 2 },
  })
    .webp({ loop: 0, delay: [100, 100] })
    .toBuffer();
  expect((await sharp(animation, { animated: true }).metadata()).pages).toBe(2);
  await expect(normalizePicture(animation, "image/webp")).rejects.toThrow();
  const large = await sharp({
    create: { width: 5000, height: 5000, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  await expect(normalizePicture(large, "image/png")).rejects.toThrow();
});

test("logo normalization preserves transparent padding and opaque artwork", async () => {
  const artwork = await sharp({
    create: { width: 2, height: 2, channels: 4, background: "red" },
  })
    .png()
    .toBuffer();
  const input = await sharp({
    create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: artwork, top: 1, left: 1 }])
    .png()
    .toBuffer();
  const output = await normalizePicture(input, "image/png");
  const { data, info } = await sharp(output)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(data[3]).toBe(0);
  expect(data[(info.width + 1) * info.channels + 3]).toBe(255);
});
