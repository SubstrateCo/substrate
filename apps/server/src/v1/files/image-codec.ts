export class ImageDecodeError extends Error {
  override name = "ImageDecodeError";
}

export interface DecodedImage {
  format: string;
  width: number;
  height: number;
  pages: number;
  toWebp(options: { maxEdge: number; quality: number }): Promise<Uint8Array>;
}

export interface ImageCodec {
  decode(bytes: Uint8Array, options: { maxPixels: number }): Promise<DecodedImage>;
}
