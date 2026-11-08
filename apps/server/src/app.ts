import { failure } from "@startup-os/contracts/result";

import { authEnvironment } from "./auth/environment";
import { auth } from "./auth/server";
import { createDesktopRoutes } from "./desktop/routes";
import { respond } from "./shared/http";
import { createAgentsRoutes } from "./v1/agents/routes";
import { createContextRoutes } from "./v1/context/routes";
import { createFilesRoutes } from "./v1/files/routes";
import { createMcpRoutes } from "./v1/mcp/routes";
import { createMessagingRoutes } from "./v1/messaging/routes";
import { createOrganizationRoutes } from "./v1/organizations/routes";
import { createSessionRoutes } from "./v1/session/routes";
import { createTasksRoutes } from "./v1/tasks/routes";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";

export function createApp() {
  const { trustedOrigins } = authEnvironment();
  return new Hono()
    .use(secureHeaders())
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
      bodyLimit({
        maxSize: 1024 * 1024,
        onError: (c) => respond(c, failure("PAYLOAD_TOO_LARGE", "Request body is too large.")),
      }),
    )
    .use("/api/*", async (c, next) => {
      c.header("Cache-Control", "no-store");
      await next();
    })
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
    .route("/desktop", createDesktopRoutes())
    .route("/api/v1/session", createSessionRoutes())
    .route("/api/v1/organizations", createOrganizationRoutes())
    .route("/api/v1/files", createFilesRoutes())
    .route("/api/v1/tasks", createTasksRoutes())
    .route("/api/v1/messaging", createMessagingRoutes())
    .route("/api/v1/mcp", createMcpRoutes())
    .route("/api/v1/context", createContextRoutes())
    .route("/api/v1/agents", createAgentsRoutes())
    .notFound((c) => respond(c, failure("NOT_FOUND", "Endpoint not found.")))
    .onError((error, c) => {
      if (error instanceof HTTPException && error.status === 400) {
        return respond(c, failure("INVALID_INPUT", "Invalid request body."));
      }
      console.error("Request failed", error.name);
      return respond(
        c,
        failure("INTERNAL_ERROR", "The operation is unavailable. Please try again."),
      );
    });
}

export type AppType = ReturnType<typeof createApp>;
