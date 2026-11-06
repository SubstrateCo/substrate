import { api } from "./client";
import { readResult } from "./result";
import { authClient } from "@/lib/auth-client";
import { unwrap } from "@/queries/organizations/options";

export type PictureKind = "avatar" | "organization-logo";
type PictureAuthClient = Pick<typeof authClient, "updateUser"> & {
  organization: Pick<typeof authClient.organization, "update">;
};

export function createPictureApi(client: PictureAuthClient) {
  async function uploadPicture(
    file: File,
    purpose: PictureKind,
    signal?: AbortSignal,
    onCommit?: () => void,
    organizationId?: string,
  ) {
    const upload = await readResult(
      api.files.uploads.$post(
        { json: { purpose, filename: file.name, contentType: file.type, size: file.size } },
        { init: { signal } },
      ),
    );
    const response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.headers,
      body: file,
      credentials: "omit",
      signal,
    });
    if (!response.ok) throw new Error("The picture could not be uploaded. Please try again.");
    const { fileId } = await readResult(
      api.files.uploads[":id"].complete.$post(
        { param: { id: upload.uploadId } },
        { init: { signal } },
      ),
    );
    signal?.throwIfAborted();
    onCommit?.();
    // Attachment commits the visible picture. Do not cancel its response after it starts.
    const url = `/api/v1/files/${fileId}/content`;
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
export const { uploadPicture, removePicture } = pictureApi;
