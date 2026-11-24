import {
  createStorageRepository,
  ensureOwnedAgentActors,
  type Database,
} from "@substrate/database/trusted";

import type { GoogleLinkTickets } from "./auth/google-link";
import { createDesktopService, type DesktopConfig } from "./desktop/service";
import type { CommittedPublisher } from "./shared/committed";
import type { ObjectStorage } from "./storage/types";
import { createDeviceService } from "./v1/agent-work/device-service";
import { createAgentWorkService } from "./v1/agent-work/service";
import { createCallerService } from "./v1/agents/callers-service";
import { createAgentService } from "./v1/agents/service";
import { createCalendarService, type CalendarServiceDependencies } from "./v1/calendar/service";
import { createContactsService } from "./v1/contacts/service";
import { createContactInteractionsService } from "./v1/context/interactions-service";
import { createContextService } from "./v1/context/service";
import { createCrmFromMessageService } from "./v1/crm/from-message-service";
import { createCrmService } from "./v1/crm/service";
import { createAttachmentService } from "./v1/files/attachments";
import { createPictureService } from "./v1/files/pictures";
import { createFileService } from "./v1/files/service";
import { createIntegrationService } from "./v1/integrations/service";
import { createMcpService } from "./v1/mcp/service";
import { createMeetingService } from "./v1/meetings/service";
import { createReadService } from "./v1/messaging/read-service";
import { createMessagingService } from "./v1/messaging/service";
import { createSharingService } from "./v1/messaging/sharing-service";
import { createOrganizationService } from "./v1/organizations/service";
import { projectPictureAccess } from "./v1/tasks/picture-access";
import { createTasksService } from "./v1/tasks/service";

export function createServices(deps: {
  db: Database;
  storage: ObjectStorage;
  publish: CommittedPublisher;
  apiURL: string;
  desktop: DesktopConfig;
  calendar: CalendarServiceDependencies;
  googleLink: GoogleLinkTickets;
}) {
  const repository = createStorageRepository(deps.db);
  return {
    desktop: createDesktopService(deps.desktop),
    meetings: createMeetingService(deps.publish),
    calendar: createCalendarService({ ...deps.calendar, publish: deps.publish }),
    integrations: createIntegrationService({
      googleLink: deps.googleLink,
      desktopScheme: deps.desktop.desktopScheme,
    }),
    crm: createCrmService(deps),
    contacts: createContactsService(deps),
    contactInteractions: createContactInteractionsService(deps),
    crmFromMessage: createCrmFromMessageService(deps),
    files: createFileService({ repository, storage: deps.storage }),
    pictures: createPictureService({
      storage: deps.storage,
      repository,
      projects: projectPictureAccess(deps.db),
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
    callers: createCallerService(deps),
    agentWork: createAgentWorkService(deps),
    devices: createDeviceService(deps),
    mcp: createMcpService(deps),
    organizations: createOrganizationService(deps),
  };
}
export type Services = ReturnType<typeof createServices>;
