import { MAX_FILE_BYTES } from "@startup-os/contracts/files/input";
import { profilePicturePath, type PictureKind } from "@startup-os/contracts/files/pictures";
import type { StorageScope } from "@startup-os/database/storage";

import { ServiceError, serviceResult } from "../../shared/service-result";
import type { ObjectStorage } from "../../storage/types";
import { normalizePicture } from "./image";

interface PictureDependencies {
  authenticate(headers: Headers): Promise<StorageScope>;
  requireOrigin(headers: Headers): void;
  repository: {
    requirePictureAccess(
      scope: StorageScope,
      purpose: PictureKind,
      ownerId?: string,
    ): Promise<void>;
    canReadPicture(scope: StorageScope, purpose: PictureKind, ownerId: string): Promise<boolean>;
  };
  storage: Pick<ObjectStorage, "put" | "signDownload">;
}

const objectKey = (purpose: PictureKind, owner: string) =>
  `pictures/${purpose}/${encodeURIComponent(owner)}.webp`;

export function createPictureService(deps: PictureDependencies) {
  return {
    upload(
      headers: Headers,
      purpose: PictureKind,
      file: File,
      organizationId?: string,
      projectEntityId?: string,
    ) {
      return serviceResult(async () => {
        deps.requireOrigin(headers);
        const scope = await deps.authenticate(headers);
        if (
          purpose !== "avatar" &&
          organizationId !== undefined &&
          organizationId !== scope.organizationId
        )
          throw new ServiceError("FORBIDDEN", "Your active workspace changed.");
        if (purpose === "project-icon" && !projectEntityId)
          throw new ServiceError("INVALID_INPUT", "Choose a project for this icon.");
        await deps.repository.requirePictureAccess(scope, purpose, projectEntityId);
        if (!file.size || file.size > MAX_FILE_BYTES)
          throw new ServiceError("INVALID_INPUT", "Use a picture up to 5 MB.");
        const bytes = await normalizePicture(new Uint8Array(await file.arrayBuffer()), file.type);
        let owner = scope.userId;
        if (purpose === "project-icon") owner = projectEntityId!;
        if (purpose === "organization-logo") owner = scope.organizationId!;
        await deps.storage.put(objectKey(purpose, owner), bytes, "image/webp");
        return { url: `${profilePicturePath(purpose, owner)}?v=${crypto.randomUUID()}` };
      });
    },
    content(headers: Headers, purpose: PictureKind, owner: string) {
      return serviceResult(async () => {
        const scope = await deps.authenticate(headers);
        if (!(await deps.repository.canReadPicture(scope, purpose, owner)))
          throw new ServiceError("NOT_FOUND", "Picture not found or access denied.");
        return { url: await deps.storage.signDownload(objectKey(purpose, owner), "inline") };
      });
    },
  };
}

export type PictureService = ReturnType<typeof createPictureService>;
