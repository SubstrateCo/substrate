import { z } from "zod";

export const managedPicture = z
  .string()
  .regex(
    /^\/api\/v1\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/content$/,
  )
  .nullable();

export function managedPicturePath(fileId: string | null) {
  return fileId === null ? null : `/api/v1/files/${fileId}/content`;
}

export function managedPictureFileId(path: z.infer<typeof managedPicture>) {
  return path === null ? null : path.split("/")[4]!;
}
