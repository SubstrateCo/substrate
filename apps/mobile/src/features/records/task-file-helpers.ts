import type { UploadFile } from "@/api/files/uploads";

export function safeTaskFilename(name: string) {
  // oxlint-disable-next-line eslint/no-control-regex -- Download names must not contain filesystem control characters.
  return name.replace(/[/\\:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+$/, "_") || "attachment";
}

export function projectPictureFile(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string;
  fileSize?: number;
  file?: globalThis.File;
}): UploadFile {
  const mimeType = asset.mimeType ?? "image/jpeg";
  return {
    uri: asset.uri,
    name: asset.fileName ?? `project-picture.${mimeType === "image/png" ? "png" : "jpg"}`,
    mimeType,
    size: asset.fileSize ?? asset.file?.size ?? 0,
    file: asset.file,
  };
}
