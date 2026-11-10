import { z } from "zod";

export const pictureKind = z.enum(["avatar", "organization-logo", "project-icon"]);
export type PictureKind = z.infer<typeof pictureKind>;
export const pictureKindParam = z.object({ purpose: pictureKind });
export const pictureOwnerParam = z
  .object({ purpose: pictureKind, owner: z.string().min(1) })
  .refine(({ purpose, owner }) => purpose !== "project-icon" || z.uuid().safeParse(owner).success);
export const pictureUploadInput = z.object({
  file: z.instanceof(File),
  organizationId: z.string().min(1).optional(),
  projectEntityId: z.uuid().optional(),
});
export type PictureUploadInput = z.infer<typeof pictureUploadInput>;

export const projectIcon = z
  .string()
  .regex(
    /^\/api\/v1\/files\/pictures\/project-icon\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\?v=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  )
  .nullable();

export function profilePicturePath(purpose: PictureKind, owner: string) {
  return `/api/v1/files/pictures/${purpose}/${encodeURIComponent(owner)}`;
}

export const managedPicture = z
  .string()
  .regex(
    /^\/api\/v1\/files\/(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/content|pictures\/(?:avatar|organization-logo)\/[A-Za-z0-9%_.~-]+\?v=[0-9a-f-]{36})$/,
  )
  .nullable();

export function managedPicturePath(fileId: string | null) {
  return fileId === null ? null : `/api/v1/files/${fileId}/content`;
}
