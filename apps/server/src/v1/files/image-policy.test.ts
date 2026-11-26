import { createSharpImageCodec } from "./image";
import { normalizePicture, previewAttachmentImage } from "./image-policy";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import sharp from "sharp";

const images = createSharpImageCodec();
const pictureError = {
  code: "INVALID_INPUT",
  message: "Use a valid, static JPEG, PNG, or WebP image up to 16 megapixels.",
};

async function animatedWebp() {
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
  return animation;
}

const largePng = () =>
  sharp({ create: { width: 5000, height: 5000, channels: 3, background: "red" } })
    .png()
    .toBuffer();

const gif = () =>
  sharp(Buffer.from([255, 0, 0, 0, 0, 255]), {
    raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
  })
    .gif({ delay: [100, 100], loop: 0 })
    .toBuffer();

test("pictures are decoded and reencoded, stripping metadata and bounding dimensions", async () => {
  const input = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: "red" },
  })
    .png()
    .withExif({ IFD0: { Artist: "private" } })
    .toBuffer();
  const result = await normalizePicture(images, input, "image/png");
  const metadata = await sharp(result).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(1024);
  expect(metadata.exif).toBeUndefined();
});

test("pictures reject MIME spoofing, non-images, SVG, GIF, animation, and excessive pixels", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const rejected: [Uint8Array, string][] = [
    [png, "image/jpeg"],
    [new TextEncoder().encode("not an image"), "image/png"],
    [
      new TextEncoder().encode(
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
      ),
      "image/png",
    ],
    [await gif(), "image/gif"],
    [await animatedWebp(), "image/webp"],
    [await largePng(), "image/png"],
  ];
  for (const [bytes, contentType] of rejected)
    await rejects(normalizePicture(images, bytes, contentType), pictureError);
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
  const output = await normalizePicture(images, input, "image/png");
  const { data, info } = await sharp(output)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(data[3]).toBe(0);
  expect(data[(info.width + 1) * info.channels + 3]).toBe(255);
});

test("attachment previews bound dimensions and strip source metadata", async () => {
  const bytes = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: "red" },
  })
    .png()
    .withExif({ IFD0: { Artist: "private" } })
    .toBuffer();
  const preview = await previewAttachmentImage(images, bytes);
  if (!preview) throw new Error("Expected a preview.");
  const metadata = await sharp(preview).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(1600);
  expect(metadata.height).toBe(800);
  expect(metadata.exif).toBeUndefined();
});

test("attachment previews reject active content, corrupt images, and excessive pixels", async () => {
  for (const bytes of [
    Buffer.from("not an image"),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
    await largePng(),
  ])
    expect(await previewAttachmentImage(images, bytes)).toBeNull();
});

test("GIF previews preserve animation", async () => {
  const preview = await previewAttachmentImage(images, await gif());
  if (!preview) throw new Error("Expected a preview.");
  const metadata = await sharp(preview, { animated: true }).metadata();
  expect(metadata.pages).toBe(2);
  expect(metadata.delay).toEqual([100, 100]);
});
