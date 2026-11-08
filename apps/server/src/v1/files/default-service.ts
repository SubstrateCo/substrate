import { createStorageRepository } from "@startup-os/database/storage";

import { db } from "../../auth/database";
import { auth } from "../../auth/server";
import { ServiceError } from "../../shared/service-result";
import { requireOrigin } from "../../shared/workspace";
import { createS3Storage } from "../../storage/s3";
import { createPictureService } from "./pictures";
import { createFileService } from "./service";

const dependencies = {
  repository: createStorageRepository(db),
  storage: createS3Storage(),
  requireOrigin,
  async authenticate(headers: Headers) {
    const session = await auth.api.getSession({ headers });
    if (!session) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
    if (!session.user.emailVerified)
      throw new ServiceError("FORBIDDEN", "Verify your email to continue.");
    return {
      userId: session.user.id,
      organizationId: session.session.activeOrganizationId ?? null,
    };
  },
};

export const defaultFileService = createFileService(dependencies);
export const defaultPictureService = createPictureService(dependencies);
