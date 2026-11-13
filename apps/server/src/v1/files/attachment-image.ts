import { ServiceError } from "../../shared/service-result";
import sharp from "sharp";

const MAX_PIXELS = 16_000_000;
const formats = new Set(["jpeg", "png", "webp", "gif"]);

export async function previewAttachmentImage(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const image = sharp(bytes, { animated: true, limitInputPixels: MAX_PIXELS, failOn: "warning" });
    const metadata = await image.metadata();
    const bounded =
      !!metadata.width && !!metadata.height && metadata.width * metadata.height <= MAX_PIXELS;
    if (!formats.has(metadata.format) || !bounded) throw new Error("Unsupported image.");
    // Decode and reencode rather than serving untrusted source bytes inline.
    return await image
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ServiceError("INVALID_INPUT", "This file cannot be previewed.");
  }
}
