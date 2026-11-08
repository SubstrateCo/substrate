import { uploadPictureFile } from "./uploads";
import { authClient } from "@/lib/auth/client";
import { unwrap } from "@/lib/auth/result";

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
    const fileId = await uploadPictureFile(file, purpose, signal);
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
