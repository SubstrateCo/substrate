import { ServiceError } from "../../shared/service-result";
import { ImageDecodeError, type DecodedImage, type ImageCodec } from "./image-codec";

const MAX_PIXELS = 16_000_000;
const QUALITY = 85;
const pictureTypes = new Map([
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);
const previewFormats = new Set(["jpeg", "png", "webp", "gif"]);

/** Reencodes an accepted image to WebP. Returns null when the image is rejected or undecodable. */
async function reencode(
  images: ImageCodec,
  bytes: Uint8Array,
  maxEdge: number,
  accepts: (image: DecodedImage) => boolean,
): Promise<Uint8Array | null> {
  try {
    const image = await images.decode(bytes, { maxPixels: MAX_PIXELS });
    if (!accepts(image) || image.width * image.height > MAX_PIXELS) return null;
    return await image.toWebp({ maxEdge, quality: QUALITY });
  } catch (error) {
    if (error instanceof ImageDecodeError) return null;
    throw error;
  }
}

/** A static JPEG, PNG, or WebP picture of the declared type, as WebP up to 1024 px. */
export async function normalizePicture(
  images: ImageCodec,
  bytes: Uint8Array,
  contentType: string,
): Promise<Uint8Array> {
  const picture = await reencode(
    images,
    bytes,
    1024,
    (image) => pictureTypes.get(image.format) === contentType && image.pages === 1,
  );
  if (!picture)
    throw new ServiceError(
      "INVALID_INPUT",
      "Use a valid, static JPEG, PNG, or WebP image up to 16 megapixels.",
    );
  return picture;
}

/** A WebP preview up to 1600 px. GIF animation is kept. Returns null when the file cannot be previewed. */
export function previewAttachmentImage(
  images: ImageCodec,
  bytes: Uint8Array,
): Promise<Uint8Array | null> {
  return reencode(images, bytes, 1600, (image) => previewFormats.has(image.format));
}
