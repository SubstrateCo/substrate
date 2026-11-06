import { managedPicturePath } from "@startup-os/contracts/files/pictures";
import { createStorageRepository } from "@startup-os/database/storage";
import { createS3Storage } from "@startup-os/storage";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { ServiceError } from "../../shared/service-result";
import { requireOrigin } from "../../shared/workspace";
import { createFileService } from "./service";

export const defaultFileService = createFileService({
  repository: createStorageRepository(db),
  storage: createS3Storage(),
  requireOrigin,
  async updatePicture(headers, purpose, fileId) {
    const url = managedPicturePath(fileId);
    if (purpose === "avatar") await auth.api.updateUser({ headers, body: { image: url } });
    else await auth.api.updateOrganization({ headers, body: { data: { logo: url } } });
    return { fileId, url };
  },
  async authenticate(headers) {
    const session = await auth.api.getSession({ headers });
    if (!session) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
    if (!session.user.emailVerified)
      throw new ServiceError("FORBIDDEN", "Verify your email to continue.");
    return {
      userId: session.user.id,
      organizationId: session.session.activeOrganizationId ?? null,
    };
  },
});
