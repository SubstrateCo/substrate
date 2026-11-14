import { previewAttachmentImage } from "./attachment-image";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import sharp from "sharp";

test("attachment previews bound dimensions and strip source metadata", async () => {
  const bytes = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: "red" },
  })
    .png()
    .withExif({ IFD0: { Artist: "private" } })
    .toBuffer();
  const metadata = await sharp(await previewAttachmentImage(bytes)).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(1600);
  expect(metadata.height).toBe(800);
  expect(metadata.exif).toBeUndefined();
});

test("attachment previews reject active content, corrupt images, and excessive pixels", async () => {
  for (const bytes of [
    Buffer.from("not an image"),
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
    await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "red" } })
      .png()
      .toBuffer(),
  ])
    await rejects(previewAttachmentImage(bytes), { message: "This file cannot be previewed." });
});

test("GIF previews preserve animation", async () => {
  const bytes = await sharp(Buffer.from([255, 0, 0, 0, 0, 255]), {
    raw: { width: 1, height: 2, channels: 3, pageHeight: 1 },
  })
    .gif({ delay: [100, 100], loop: 0 })
    .toBuffer();
  const metadata = await sharp(await previewAttachmentImage(bytes), { animated: true }).metadata();
  expect(metadata.pages).toBe(2);
  expect(metadata.delay).toEqual([100, 100]);
});
