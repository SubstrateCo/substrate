import { z } from "zod";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const filePurpose = z.enum(["file", "avatar", "organization-logo"]);
export const createUploadInput = z
  .object({
    purpose: filePurpose,
    filename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((name) =>
        name
          .split("")
          .every(
            (character) =>
              character.charCodeAt(0) >= 32 &&
              character.charCodeAt(0) !== 127 &&
              character !== "/" &&
              character !== "\\",
          ),
      ),
    contentType: z
      .string()
      .max(127)
      .regex(/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/),
    size: z.number().int().positive().max(MAX_FILE_BYTES),
  })
  .strict()
  .refine(
    (input) =>
      input.purpose === "file" ||
      ["image/jpeg", "image/png", "image/webp"].includes(input.contentType),
    { message: "Use a JPEG, PNG, or WebP image." },
  );
export const uploadIdParam = z.object({ id: z.uuid() });
export type FilePurpose = z.infer<typeof filePurpose>;
export type CreateUploadInput = z.infer<typeof createUploadInput>;
export interface UploadTicket {
  uploadId: string;
  uploadUrl: string;
  headers: Record<string, string>;
}
export interface CompletedUpload {
  fileId: string;
}
