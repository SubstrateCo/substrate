import { ImageDecodeError, type ImageCodec } from "./image-codec";
import sharp from "sharp";

async function decoding<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new ImageDecodeError("Image could not be decoded.", { cause: error });
  }
}

export function createSharpImageCodec(): ImageCodec {
  return {
    async decode(bytes, { maxPixels }) {
      const image = sharp(bytes, {
        limitInputPixels: maxPixels,
        failOn: "warning",
        animated: true,
      });
      const metadata = await decoding(() => image.metadata());
      if (!metadata.width || !metadata.height)
        throw new ImageDecodeError("Image has no dimensions.");
      return {
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        pages: metadata.pages ?? 1,
        toWebp: ({ maxEdge, quality }) =>
          decoding(() =>
            image
              .rotate()
              .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
              .webp({ quality })
              .toBuffer(),
          ),
      };
    },
  };
}
