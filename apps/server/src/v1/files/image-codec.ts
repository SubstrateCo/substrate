/** Thrown when bytes cannot be decoded or reencoded as an image. */
export class ImageDecodeError extends Error {
  override name = "ImageDecodeError";
}

export interface DecodedImage {
  /** The detected format, such as `jpeg`, `png`, `webp`, or `gif`. */
  format: string;
  width: number;
  height: number;
  /** Frames in the source. Static images have one. */
  pages: number;
  /** New pixels in WebP, oriented, without source metadata, and fit inside `maxEdge` square. */
  toWebp(options: { maxEdge: number; quality: number }): Promise<Uint8Array>;
}

export interface ImageCodec {
  /** Refuses sources over `maxPixels` before it decodes them. */
  decode(bytes: Uint8Array, options: { maxPixels: number }): Promise<DecodedImage>;
}
