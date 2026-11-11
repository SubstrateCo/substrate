import { attachmentReferences } from "@substrate/database/files";
import { createStorageRepository } from "@substrate/database/storage";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { requireOrigin, requireVerified } from "../../shared/workspace";
import { createS3Storage } from "../../storage/s3";
import { projectPictureAccess } from "../tasks/picture-access";
import { createPictureService } from "./pictures";
import { createFileService } from "./service";

const dependencies = {
  repository: createStorageRepository(db, attachmentReferences),
  storage: createS3Storage(),
  requireOrigin,
  async authenticate(headers: Headers) {
    const session = requireVerified(await auth.api.getSession({ headers }));
    return {
      userId: session.user.id,
      organizationId: session.session.activeOrganizationId ?? null,
    };
  },
};

export const defaultFileService = createFileService(dependencies);
const projectPictures = projectPictureAccess(db);
export const defaultPictureService = createPictureService({
  ...dependencies,
  repository: {
    async requirePictureAccess(scope, purpose, ownerId) {
      if (purpose === "project-icon") return projectPictures.requireEdit(scope, ownerId!);
      return dependencies.repository.requirePictureAccess(scope, purpose);
    },
    async canReadPicture(scope, purpose, ownerId) {
      if (purpose === "project-icon") return projectPictures.canRead(scope, ownerId);
      return dependencies.repository.canReadPicture(scope, purpose, ownerId);
    },
  },
});
