import { failure, publicFailure } from "@substrate/contracts/result";

import type { Auth } from "./auth/server";
import { createDesktopRoutes } from "./desktop/routes";
import type { Services } from "./services";
import { respond } from "./shared/http";
import { trustedOrigin } from "./shared/origin";
import type { Scopes } from "./shared/scope";
import { createAgentWorkRoutes } from "./v1/agent-work/routes";
import { createCallerRoutes } from "./v1/agents/callers-routes";
import { createAgentsRoutes } from "./v1/agents/routes";
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
import { createMcpRoutes } from "./v1/mcp/routes";
import { createReadRoutes } from "./v1/messaging/read-routes";
import { createMessagingRoutes } from "./v1/messaging/routes";
import { createSharingRoutes } from "./v1/messaging/sharing-routes";
import { createOrganizationRoutes } from "./v1/organizations/routes";
import type { createRealtimeRoutes } from "./v1/realtime/routes";
import { createTasksRoutes } from "./v1/tasks/routes";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { except } from "hono/combine";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import type { ExtractSchema } from "hono/types";

export interface AppDependencies {
  auth: Pick<Auth, "handler">;
  services: Services;
  scopes: Scopes;
  trustedOrigins: string[];
  realtime?: Pick<ReturnType<typeof createRealtimeRoutes>, "app">;
}

export function createApp({ auth, services, scopes, trustedOrigins, realtime }: AppDependencies) {
  const app = new Hono();
  // Upgrade handlers must run before response-mutating middleware. Hono owns routing;
  // Bun only receives its websocket callbacks in main.ts.
  if (realtime) app.route("/", realtime.app);
  const wired = app
    .use(secureHeaders())
    // Liveness only: reports that this process serves HTTP, without checking dependencies.
    .get("/health", (c) => {
      c.header("Cache-Control", "no-store");
      return c.json({ status: "ok" });
    });
  return wired
    .use(
      "/api/*",
      cors({
        origin: (origin) => (trustedOrigins.includes(origin) ? origin : undefined),
        credentials: true,
        allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      }),
    )
    .use(
      "/api/*",
      // Picture uploads set their own, larger limit on the route.
      except(
        "/api/v1/files/pictures/:purpose",
        bodyLimit({
          maxSize: 1024 * 1024,
          onError: (c) =>
            respond(c, publicFailure("PAYLOAD_TOO_LARGE", "Request body is too large.")),
        }),
      ),
    )
    .use("/api/*", async (c, next) => {
      c.header("Cache-Control", "no-store");
      await next();
    })
    .use("/api/v1/*", trustedOrigin(trustedOrigins))
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
    .route("/desktop", createDesktopRoutes(services.desktop))
    .route("/api/v1/organizations", createOrganizationRoutes(services.organizations, scopes))
    .route("/api/v1/files/pictures", createPictureRoutes(services.pictures, scopes))
    .route("/api/v1/files/attachments", createAttachmentRoutes(services.attachments, scopes))
    .route("/api/v1/files", createFilesRoutes(services.files, scopes))
    .route("/api/v1/tasks", createTasksRoutes(services.tasks, scopes))
    .route("/api/v1/crm", createCrmExportRoutes(services.crm, scopes))
    .route("/api/v1/crm", createCrmManagementRoutes(services.crm, scopes))
    .route("/api/v1/crm", createCrmRoutes(services.crm, scopes))
    .route("/api/v1/contacts", createContactsExportRoutes(services.contacts, scopes))
    .route("/api/v1/contacts", createContactsRoutes(services.contacts, scopes))
    .route(
      "/api/v1/context/interactions",
      createContactInteractionsRoutes(services.contactInteractions, scopes),
    )
    .route("/api/v1/crm", createCrmFromMessageRoutes(services.crmFromMessage, scopes))
    .route("/api/v1/messaging", createMessagingRoutes(services.messaging, scopes))
    .route("/api/v1/messaging", createReadRoutes(services.messagingRead, scopes))
    .route("/api/v1/messaging/sharing", createSharingRoutes(services.sharing, scopes))
    .route("/api/v1/mcp", createMcpRoutes(services.mcp, scopes))
    .route("/api/v1/context", createContextRoutes(services.context, scopes))
    .route("/api/v1/agents", createAgentsRoutes(services.agents, scopes))
    .route("/api/v1/agents", createCallerRoutes(services.callers, scopes))
    .route(
      "/api/v1/agent-work",
      createAgentWorkRoutes(services.agentWork, services.devices, scopes),
    )
    .notFound((c) => respond(c, publicFailure("NOT_FOUND", "Endpoint not found.")))
    .onError((error, c) => {
      if (error instanceof HTTPException && error.status === 400) {
        return respond(c, publicFailure("INVALID_INPUT", "Invalid request body."));
      }
      console.error("Request failed", error.name);
      return respond(
        c,
        failure("INTERNAL_ERROR", "The operation is unavailable. Please try again."),
      );
    });
}

type AppSchema = ExtractSchema<ReturnType<typeof createApp>>;
// Flatten the accumulated route schema before the RPC client expands it.
export type AppType = Hono<{}, { [Path in keyof AppSchema]: AppSchema[Path] }>;
