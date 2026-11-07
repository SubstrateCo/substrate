export function validateFiles(
  files: File[],
  {
    accept,
    maxSize,
    multiple = false,
  }: {
    accept?: string;
    maxSize?: number;
    multiple?: boolean;
  },
): string | null {
  if (!multiple && files.length > 1) return "Choose one file at a time.";
  const types = accept
    ?.split(",")
    .map((type) => type.trim().toLowerCase())
    .filter(Boolean);
  for (const file of files) {
    if (maxSize !== undefined && file.size > maxSize)
      return `Each file must be ${Math.round((maxSize / 1024 / 1024) * 10) / 10} MB or smaller.`;
    if (
      types?.length &&
      !types.some((type) => {
        if (type.startsWith(".")) return file.name.toLowerCase().endsWith(type);
        if (type.endsWith("/*")) return file.type.toLowerCase().startsWith(type.slice(0, -1));
        return file.type.toLowerCase() === type;
      })
    ) {
      return "This file type is not supported.";
    }
  }
  return null;
}

export const pictureAccept = "image/jpeg,image/png,image/webp";
export const pictureMaxSize = 5 * 1024 * 1024;

export async function validatePicture(file: File): Promise<string | null> {
  const error = validateFiles([file], { accept: pictureAccept, maxSize: pictureMaxSize });
  if (error) return error;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10];
  let matches: boolean;
  if (file.type === "image/png") matches = png.every((byte, index) => bytes[index] === byte);
  else if (file.type === "image/jpeg")
    matches = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  else
    matches =
      bytes.length === 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return matches
    ? null
    : "This image could not be opened. Choose a valid JPEG, PNG, or WebP image.";
}
