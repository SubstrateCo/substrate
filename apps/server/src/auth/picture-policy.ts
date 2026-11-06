import { APIError } from "better-auth/api";
import { z } from "zod";
import { managedPicture, managedPictureFileId } from "@startup-os/contracts/files/pictures";
import { AccessDeniedError } from "@startup-os/database";
import type { StorageRepository } from "@startup-os/database/storage";

const pictureInput = z.looseObject({
  image: z.unknown().optional(),
  logo: z.unknown().optional(),
  organizationId: z.string().optional(),
  data: z.looseObject({ logo: z.unknown().optional() }).optional(),
});

function parsePicture(value: z.input<typeof managedPicture>) {
  const parsed = managedPicture.safeParse(value);
  if (!parsed.success)
    throw new APIError("BAD_REQUEST", { message: "Use a completed managed picture URL or null." });
  return managedPictureFileId(parsed.data);
}

export function protectUserPicture<T extends object>(input: T, creating = false): T {
  if ("image" in input && input.image !== undefined) {
    if (creating && input.image !== null)
      throw new APIError("BAD_REQUEST", {
        message: "Upload a picture after creating your account.",
      });
    const parsed = managedPicture.safeParse(input.image);
    if (!parsed.success)
      throw new APIError("BAD_REQUEST", {
        message: "Use a completed managed picture URL or null.",
      });
  }
  return input;
}

export interface PictureMutation {
  purpose: "avatar" | "organization-logo";
  fileId: string | null;
  organizationId: string | undefined;
}

export function readPictureMutation(
  path: string,
  body: z.input<typeof pictureInput>,
): PictureMutation | null {
  const parsed = pictureInput.safeParse(body);
  if (!parsed.success) return null;
  const input = parsed.data;
  if (
    (path === "/sign-up/email" && input.image != null) ||
    (path === "/organization/create" && input.logo != null)
  )
    throw new APIError("BAD_REQUEST", {
      message: "Upload a picture after creating the account or organization.",
    });
  const purpose = path === "/update-user" ? "avatar" : "organization-logo";
  if (path !== "/update-user" && path !== "/organization/update") return null;
  const value = purpose === "avatar" ? input.image : input.data?.logo;
  if (value === undefined) return null;
  const picture = managedPicture.safeParse(value);
  if (!picture.success)
    throw new APIError("BAD_REQUEST", { message: "Use a completed managed picture URL or null." });
  return { purpose, fileId: parsePicture(picture.data), organizationId: input.organizationId };
}

interface PictureSession {
  user: { id: string; emailVerified: boolean };
  session: { id?: string; activeOrganizationId?: string | null };
}

export async function authorizePictureMutation(
  mutation: PictureMutation,
  session: PictureSession | null,
  repository: Pick<StorageRepository, "validatePicture">,
) {
  if (!session) throw new APIError("UNAUTHORIZED", { message: "Sign in to continue." });
  if (!session.user.emailVerified)
    throw new APIError("FORBIDDEN", { message: "Verify your email to continue." });
  const organizationId = session.session.activeOrganizationId ?? null;
  if (
    mutation.purpose === "organization-logo" &&
    mutation.organizationId !== undefined &&
    mutation.organizationId !== organizationId
  )
    throw new APIError("FORBIDDEN", { message: "Your active workspace changed." });
  try {
    await repository.validatePicture(
      { userId: session.user.id, organizationId },
      mutation.purpose,
      mutation.fileId,
    );
  } catch (error) {
    if (error instanceof AccessDeniedError)
      throw new APIError("BAD_REQUEST", { message: "Picture not found or access denied." });
    throw error;
  }
}
