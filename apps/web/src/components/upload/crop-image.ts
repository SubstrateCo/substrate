import { validatePicture } from "./file-validation";

export type CropArea = { x: number; y: number; width: number; height: number };
const maxImagePixels = 32_000_000;
const maxImageDimension = 8192;

/** A picture the user must replace. Its message is reviewed copy that the UI can show. */
export class PictureError extends Error {}

/** Shows a picture's own limit, or a fallback for any other failure. */
export function pictureErrorMessage(error: Error) {
  return error instanceof PictureError ? error.message : "This image could not be opened.";
}

export function checkImageDimensions(width: number, height: number) {
  const hasValidSize = Number.isFinite(width + height) && width >= 1 && height >= 1;
  const withinDimensions = width <= maxImageDimension && height <= maxImageDimension;
  if (!hasValidSize || !withinDimensions || width * height > maxImagePixels) {
    throw new PictureError("Choose an image up to 8192 pixels per side and 32 megapixels.");
  }
}

export async function openPicture(file: File, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const error = await validatePicture(file);
  signal?.throwIfAborted();
  if (error) throw new PictureError(error);
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    signal?.throwIfAborted();
    throw new PictureError(
      "This image could not be opened. Choose a valid JPEG, PNG, or WebP image.",
    );
  }
  try {
    signal?.throwIfAborted();
    checkImageDimensions(image.width, image.height);
  } catch (error) {
    image.close();
    throw error;
  }
  return image;
}

/** Export a square PNG. Browsers apply EXIF orientation before the user crop. */
export async function cropImage(
  file: File,
  area: CropArea | null,
  rotation: number,
  mode: "fit" | "fill",
  signal?: AbortSignal,
): Promise<Blob> {
  const image = await openPicture(file, signal);
  try {
    signal?.throwIfAborted();
    const quarterTurn = ((rotation % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(quarterTurn)) throw new Error("Invalid rotation.");
    const width = quarterTurn % 180 === 0 ? image.width : image.height;
    const height = quarterTurn % 180 === 0 ? image.height : image.width;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image editing is not available.");
    let scale: number;
    if (mode === "fit") {
      scale = 512 / Math.max(width, height);
      context.translate(256, 256);
    } else {
      const finiteArea =
        area !== null && Number.isFinite(area.x + area.y + area.width + area.height);
      const validArea = finiteArea && area.width > 0 && area.height > 0;
      if (!validArea) throw new Error("Adjust the crop and try again.");
      scale = 512 / area.width;
      context.translate((width / 2 - area.x) * scale, (height / 2 - area.y) * scale);
    }
    context.scale(scale, scale);
    context.rotate((quarterTurn * Math.PI) / 180);
    context.drawImage(image, -image.width / 2, -image.height / 2);
    signal?.throwIfAborted();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Image could not be saved."))),
        "image/png",
      ),
    );
    signal?.throwIfAborted();
    return blob;
  } finally {
    image.close();
  }
}
