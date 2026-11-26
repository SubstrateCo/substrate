import { createSharpImageCodec } from "./image";
import { ImageDecodeError } from "./image-codec";
import { test } from "bun:test";
import { rejects } from "node:assert/strict";
import sharp from "sharp";

const images = createSharpImageCodec();

test("undecodable bytes and sources over the pixel limit fail with the neutral decode error", async () => {
  await rejects(
    images.decode(new TextEncoder().encode("not an image"), { maxPixels: 100 }),
    ImageDecodeError,
  );
  const png = await sharp({ create: { width: 20, height: 20, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  await rejects(
    async () => (await images.decode(png, { maxPixels: 100 })).toWebp({ maxEdge: 10, quality: 85 }),
    ImageDecodeError,
  );
});
