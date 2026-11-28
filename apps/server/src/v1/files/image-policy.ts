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

export function previewAttachmentImage(
  images: ImageCodec,
  bytes: Uint8Array,
): Promise<Uint8Array | null> {
  return reencode(images, bytes, 1600, (image) => previewFormats.has(image.format));
}
