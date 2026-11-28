import {
  managedPicture,
  profilePicturePath,
  type PictureKind,
} from "@substrate/contracts/files/pictures";
import { AccessDeniedError } from "@substrate/database";
import type { StorageRepository } from "@substrate/database/storage";

import { ServiceError } from "../shared/service-result";
import { requireVerified, requireWorkspace } from "../shared/workspace";
import { APIError } from "better-auth/api";
import { z } from "zod";

const pictureInput = z.looseObject({
  image: z.unknown().optional(),
  logo: z.unknown().optional(),
  organizationId: z.string().optional(),
  data: z.looseObject({ logo: z.unknown().optional() }).optional(),
});

export function protectUserPicture<T extends object>(input: T, creating = false): T {
  if ("image" in input && input.image !== undefined) {
    if (creating && input.image !== null)
      throw new APIError("BAD_REQUEST", {
        message: "Upload a picture after creating your account.",
      });
    const parsed = managedPicture.safeParse(input.image);
    if (!parsed.success)
      throw new APIError("BAD_REQUEST", {
        message: "Use an uploaded picture URL or null.",
      });
  }
  return input;
}

export interface PictureMutation {
  purpose: Exclude<PictureKind, "project-icon">;
  url: string | null;
  organizationId: string | undefined;
}

export function readPictureMutation({
  // oxlint-disable-next-line deslop/prefer-literal-union -- Better Auth hooks pass every endpoint path; unrelated paths must be ignored.
  path,
  body,
}: {
  path: string;
  body: unknown;
}): PictureMutation | null {
  if (
    !["/sign-up/email", "/organization/create", "/update-user", "/organization/update"].includes(
      path,
    )
  )
    return null;
  const parsed = pictureInput.safeParse(body);
  if (!parsed.success)
    throw new APIError("BAD_REQUEST", { message: "Invalid picture mutation input." });
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
    throw new APIError("BAD_REQUEST", { message: "Use an uploaded picture URL or null." });
  return {
    purpose,
    url: picture.data,
    organizationId: input.organizationId,
  };
}

interface PictureSession {
  user: { id: string; emailVerified: boolean };
  session: { id?: string; activeOrganizationId?: string | null };
}

function pictureSession(mutation: PictureMutation, session: PictureSession | null) {
  try {
    const verified = requireVerified(session);
    const organizationId = verified.session.activeOrganizationId ?? null;
    if (mutation.purpose === "organization-logo" && mutation.organizationId !== undefined)
      requireWorkspace(mutation.organizationId, organizationId);
    return { userId: verified.user.id, organizationId };
  } catch (error) {
    if (!(error instanceof ServiceError)) throw error;
    throw new APIError(error.code === "UNAUTHENTICATED" ? "UNAUTHORIZED" : "FORBIDDEN", {
      code: error.reason ?? error.code,
      message: error.message,
    });
  }
}

export async function authorizePictureMutation(
  mutation: PictureMutation,
  session: PictureSession | null,
  repository: Pick<StorageRepository, "requirePictureAccess">,
) {
  const { userId, organizationId } = pictureSession(mutation, session);
  const owner = mutation.purpose === "avatar" ? userId : organizationId;
  if (
    mutation.url !== null &&
    (!owner || !mutation.url.startsWith(`${profilePicturePath(mutation.purpose, owner)}?v=`))
  )
    throw new APIError("BAD_REQUEST", { message: "Use your own uploaded picture URL." });
  try {
    await repository.requirePictureAccess({ userId, organizationId }, mutation.purpose);
  } catch (error) {
    if (error instanceof AccessDeniedError)
      throw new APIError("BAD_REQUEST", {
        code: "NOT_FOUND",
        message: "Picture not found or access denied.",
      });
    throw error;
  }
}
