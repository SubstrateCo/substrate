import type {
  PictureUploadInput,
  PictureKind as ManagedPictureKind,
} from "@substrate/contracts/files/pictures";

import { api, type Api } from "../client";
import { readResult } from "../result";
import { authClient } from "@/api/auth/client";
import { unwrap } from "@/api/auth/result";

export type PictureKind = Exclude<ManagedPictureKind, "project-icon">;
type PictureAuthClient = Pick<typeof authClient, "updateUser"> & {
  organization: Pick<typeof authClient.organization, "update">;
};

export async function uploadPictureBytes(
  file: File,
  purpose: ManagedPictureKind,
  signal?: AbortSignal,
  organizationId?: string,
  projectEntityId?: string,
  http: Api = api,
) {
  const form: PictureUploadInput = { file };
  if (purpose !== "avatar" && organizationId) form.organizationId = organizationId;
  if (projectEntityId) form.projectEntityId = projectEntityId;
  return readResult(
    http.files.pictures[":purpose"].$post({ param: { purpose }, form }, { init: { signal } }),
  );
}

export function createPictureApi(client: PictureAuthClient, http: Api = api) {
  const savePicture = async (purpose: PictureKind, url: string | null, organizationId?: string) =>
    purpose === "avatar"
      ? unwrap(await client.updateUser({ image: url }))
      : unwrap(await client.organization.update({ organizationId, data: { logo: url } }));

  async function uploadPicture(
    file: File,
    purpose: PictureKind,
    uploadSignal?: AbortSignal,
    onCommit?: () => void,
    organizationId?: string,
  ) {
    const { url } = await uploadPictureBytes(
      file,
      purpose,
      uploadSignal,
      organizationId,
      undefined,
      http,
    );
    uploadSignal?.throwIfAborted();
    onCommit?.();
    return savePicture(purpose, url, organizationId);
  }

  const removePicture = (purpose: PictureKind, organizationId?: string) =>
    savePicture(purpose, null, organizationId);
  return { uploadPicture, removePicture };
}

export const pictureApi = createPictureApi(authClient);
