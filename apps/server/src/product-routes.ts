import type { Services } from "./services";
import type { Scopes } from "./shared/scope";
import { createAgentWorkRoutes } from "./v1/agent-work/routes";
import { createAgentsRoutes } from "./v1/agents/routes";
import { createAttentionRoutes } from "./v1/attention/routes";
import { createCalendarRoutes } from "./v1/calendar/routes";
import { createContactsExportRoutes } from "./v1/contacts/export-routes";
import { createContactsRoutes } from "./v1/contacts/routes";
import { createContactInteractionsRoutes } from "./v1/context/interactions-routes";
import { createContextRoutes } from "./v1/context/routes";
import { createCrmExportRoutes } from "./v1/crm/export-routes";
import { createCrmFromMessageRoutes } from "./v1/crm/from-message-routes";
import { createCrmManagementRoutes } from "./v1/crm/management-routes";
import { createCrmRoutes } from "./v1/crm/routes";
import { createAttachmentRoutes } from "./v1/files/attachment-routes";
import { createPictureRoutes } from "./v1/files/picture-routes";
import { createFilesRoutes } from "./v1/files/routes";
import { createIntegrationRoutes } from "./v1/integrations/routes";
import { createMcpRoutes } from "./v1/mcp/routes";
import { createReadRoutes } from "./v1/messaging/read-routes";
import { createMessagingRoutes } from "./v1/messaging/routes";
import { createSharingRoutes } from "./v1/messaging/sharing-routes";
import { createNotificationPreferencesRoutes } from "./v1/notifications/routes";
import { createOrganizationRoutes } from "./v1/organizations/routes";
import { createTasksRoutes } from "./v1/tasks/routes";
import { Hono } from "hono";

export function createProductRoutes(services: Services, scopes: Scopes) {
  return new Hono()
    .route("/attention", createAttentionRoutes(services.attention, scopes))
    .route("/organizations", createOrganizationRoutes(services.organizations, scopes))
    .route(
      "/notifications",
      createNotificationPreferencesRoutes(services.notificationPreferences, scopes),
    )
    .route("/files/pictures", createPictureRoutes(services.pictures, scopes))
    .route("/files/attachments", createAttachmentRoutes(services.attachments, scopes))
    .route("/files", createFilesRoutes(services.files, scopes))
    .route("/tasks", createTasksRoutes(services.tasks, scopes))
    .route("/crm", createCrmExportRoutes(services.crm, scopes))
    .route("/crm", createCrmManagementRoutes(services.crm, scopes))
    .route("/crm", createCrmRoutes(services.crm, scopes))
    .route("/contacts", createContactsExportRoutes(services.contacts, scopes))
    .route("/contacts", createContactsRoutes(services.contacts, scopes))
    .route(
      "/context/interactions",
      createContactInteractionsRoutes(services.contactInteractions, scopes),
    )
    .route("/crm", createCrmFromMessageRoutes(services.crmFromMessage, scopes))
    .route("/calendar", createCalendarRoutes(services.calendar, scopes))
    .route("/integrations", createIntegrationRoutes(services.integrations, scopes))
    .route("/messaging", createMessagingRoutes(services.messaging, scopes))
    .route("/messaging", createReadRoutes(services.messagingRead, scopes))
    .route("/messaging/sharing", createSharingRoutes(services.sharing, scopes))
    .route("/mcp", createMcpRoutes(services.mcp, scopes))
    .route("/context", createContextRoutes(services.context, scopes))
    .route("/agents", createAgentsRoutes(services.agents, scopes, services.skillCatalog))
    .route(
      "/agent-work",
      createAgentWorkRoutes(
        services.agentWork,
        services.devices,
        services.host,
        services.work,
        scopes,
      ),
    );
}
