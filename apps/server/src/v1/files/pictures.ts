import { MAX_FILE_BYTES } from "@substrate/contracts/files/input";
import { profilePicturePath, type PictureKind } from "@substrate/contracts/files/pictures";
import type { StorageScope } from "@substrate/database/storage";

import { ServiceError, serviceResult } from "../../shared/service-result";
import { requireWorkspace } from "../../shared/workspace";
import type { ObjectStorage } from "../../storage/types";
import { normalizePicture } from "./image";

interface PictureDependencies {
  repository: {
    requirePictureAccess(
      scope: StorageScope,
      purpose: Exclude<PictureKind, "project-icon">,
    ): Promise<void>;
    canReadPicture(
      scope: StorageScope,
      purpose: Exclude<PictureKind, "project-icon">,
      ownerId: string,
    ): Promise<boolean>;
  };
  projects: {
    requireEdit(scope: StorageScope, id: string): Promise<void>;
    canRead(scope: StorageScope, id: string): Promise<boolean>;
  };
  storage: Pick<ObjectStorage, "put" | "signDownload">;
}

const objectKey = (purpose: PictureKind, owner: string) =>
  `pictures/${purpose}/${encodeURIComponent(owner)}.webp`;

export function createPictureService(deps: PictureDependencies) {
  function requireAccess(scope: StorageScope, purpose: PictureKind, ownerId?: string) {
    return purpose === "project-icon"
      ? deps.projects.requireEdit(scope, ownerId!)
      : deps.repository.requirePictureAccess(scope, purpose);
  }
  function canRead(scope: StorageScope, purpose: PictureKind, ownerId: string) {
    return purpose === "project-icon"
      ? deps.projects.canRead(scope, ownerId)
      : deps.repository.canReadPicture(scope, purpose, ownerId);
  }
  return {
    upload(
      scope: StorageScope,
      purpose: PictureKind,
      file: { bytes: Uint8Array; contentType: string },
      organizationId?: string,
      projectEntityId?: string,
    ) {
      return serviceResult(async () => {
        if (purpose !== "avatar")
          requireWorkspace(organizationId ?? scope.organizationId ?? "", scope.organizationId);
        if (purpose === "project-icon" && !projectEntityId)
          throw new ServiceError("INVALID_INPUT", "Choose a project for this icon.");
        await requireAccess(scope, purpose, projectEntityId);
        if (!file.bytes.byteLength || file.bytes.byteLength > MAX_FILE_BYTES)
          throw new ServiceError("INVALID_INPUT", "Use a picture up to 5 MB.");
        const bytes = await normalizePicture(file.bytes, file.contentType);
        let owner = scope.userId;
        if (purpose === "project-icon") owner = projectEntityId!;
        if (purpose === "organization-logo") owner = scope.organizationId!;
        await deps.storage.put(objectKey(purpose, owner), bytes, "image/webp");
        return { url: `${profilePicturePath(purpose, owner)}?v=${crypto.randomUUID()}` };
      });
    },
    content(scope: StorageScope, purpose: PictureKind, owner: string) {
      return serviceResult(async () => {
        if (!(await canRead(scope, purpose, owner)))
          throw new ServiceError("NOT_FOUND", "Picture not found or access denied.");
        return {
          url: await deps.storage.signDownload(objectKey(purpose, owner), { kind: "inline" }),
        };
      });
    },
  };
}

export type PictureService = ReturnType<typeof createPictureService>;
