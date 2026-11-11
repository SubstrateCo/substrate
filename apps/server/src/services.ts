import { attachmentReferences } from "@substrate/database/files";
import {
  createStorageRepository,
  ensureOwnedAgentActors,
  type Database,
} from "@substrate/database/trusted";

import type { ObjectStorage } from "./storage/types";
import { createDeviceService } from "./v1/agent-work/device-service";
import { createAgentWorkService } from "./v1/agent-work/service";
import { createAgentService } from "./v1/agents/service";
import { createContextService } from "./v1/context/service";
import { createAttachmentService } from "./v1/files/attachments";
import { createPictureService } from "./v1/files/pictures";
import { createFileService } from "./v1/files/service";
import { createMcpService } from "./v1/mcp/service";
import { createReadService } from "./v1/messaging/read-service";
import { createMessagingService } from "./v1/messaging/service";
import { createSharingService } from "./v1/messaging/sharing-service";
import { createOrganizationService } from "./v1/organizations/service";
import type { CommittedPublisher } from "./v1/realtime/committed";
import { createSessionService } from "./v1/session/service";
import { projectPictureAccess } from "./v1/tasks/picture-access";
import { createTasksService } from "./v1/tasks/service";

export function createServices(deps: {
  db: Database;
  storage: ObjectStorage;
  publish: CommittedPublisher;
}) {
  const repository = createStorageRepository(deps.db, attachmentReferences);
  const projectPictures = projectPictureAccess(deps.db);
  return {
    files: createFileService({ repository, storage: deps.storage }),
    pictures: createPictureService({
      storage: deps.storage,
      repository: {
        requirePictureAccess(scope, purpose, ownerId) {
          return purpose === "project-icon"
            ? projectPictures.requireEdit(scope, ownerId!)
            : repository.requirePictureAccess(scope, purpose);
        },
        canReadPicture(scope, purpose, ownerId) {
          return purpose === "project-icon"
            ? projectPictures.canRead(scope, ownerId)
            : repository.canReadPicture(scope, purpose, ownerId);
        },
      },
    }),
    attachments: createAttachmentService(deps),
    messaging: createMessagingService(deps),
    messagingRead: createReadService(deps.publish),
    sharing: createSharingService(deps),
    tasks: createTasksService({
      ...deps,
      ensureOwnedAgentActors: async (identity) => {
        await ensureOwnedAgentActors(deps.db, identity);
      },
    }),
    context: createContextService(deps),
    agents: createAgentService(deps),
    agentWork: createAgentWorkService(deps),
    devices: createDeviceService(deps),
    mcp: createMcpService(deps),
    session: createSessionService(),
    organizations: createOrganizationService(),
  };
}
export type Services = ReturnType<typeof createServices>;
