import type {
  PictureUploadInput,
  PictureKind as ManagedPictureKind,
} from "@substrate/contracts/files/pictures";

import { api } from "../client";
import { readResult } from "../result";
import { authClient } from "@/lib/auth/client";
import { unwrap } from "@/lib/auth/result";

export type PictureKind = "avatar" | "organization-logo";
type PictureAuthClient = Pick<typeof authClient, "updateUser"> & {
  organization: Pick<typeof authClient.organization, "update">;
};

export async function uploadPictureBytes(
  file: File,
  purpose: ManagedPictureKind,
  signal?: AbortSignal,
  organizationId?: string,
  projectEntityId?: string,
) {
  const form: PictureUploadInput = { file };
  if (purpose !== "avatar" && organizationId) form.organizationId = organizationId;
  if (projectEntityId) form.projectEntityId = projectEntityId;
  return readResult(
    api.files.pictures[":purpose"].$post({ param: { purpose }, form }, { init: { signal } }),
  );
}

export function createPictureApi(client: PictureAuthClient) {
  async function uploadPicture(
    file: File,
    purpose: PictureKind,
    signal?: AbortSignal,
    onCommit?: () => void,
    organizationId?: string,
  ) {
    const { url } = await uploadPictureBytes(file, purpose, signal, organizationId);
    signal?.throwIfAborted();
    onCommit?.();
    // Do not cancel the Better Auth save once it starts.
    return purpose === "avatar"
      ? unwrap(await client.updateUser({ image: url }))
      : unwrap(await client.organization.update({ organizationId, data: { logo: url } }));
  }

  const removePicture = async (purpose: PictureKind, organizationId?: string) =>
    purpose === "avatar"
      ? unwrap(await client.updateUser({ image: null }))
      : unwrap(await client.organization.update({ organizationId, data: { logo: null } }));
  return { uploadPicture, removePicture };
}

export const pictureApi = createPictureApi(authClient);
