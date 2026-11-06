import { ServiceError } from "../../shared/service-result";
import sharp from "sharp";

const MAX_PIXELS = 16_000_000;
const formats = new Map([
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

export async function normalizePicture(
  bytes: Uint8Array,
  contentType: string,
): Promise<Uint8Array> {
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "warning", animated: true });
    const metadata = await image.metadata();
    const detectedType = formats.get(metadata.format);
    if (
      !detectedType ||
      detectedType !== contentType ||
      (metadata.pages ?? 1) !== 1 ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MAX_PIXELS
    )
      throw new Error("Unsupported image.");
    // New pixels, no source metadata, no active content, and one predictable output format.
    return await image
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ServiceError(
      "INVALID_INPUT",
      "Use a valid, static JPEG, PNG, or WebP image up to 16 megapixels.",
    );
  }
}
