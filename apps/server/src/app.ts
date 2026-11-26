import { failure, publicFailure } from "@substrate/contracts/result";

import type { Auth } from "./auth/server";
import { createDesktopRoutes } from "./desktop/routes";
import { createProductRoutes } from "./product-routes";
import type { Services } from "./services";
import { respond } from "./shared/http";
import { trustedOrigin } from "./shared/origin";
import type { Scopes } from "./shared/scope";
import type { createRealtimeRoutes } from "./v1/realtime/routes";
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
  if (realtime) {
    app.route("/api/v1", realtime.app);
    app.route("/api/mobile", realtime.app);
  }
  const products = createProductRoutes(services, scopes);
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
        allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      }),
    )
    .use(
      "/api/*",
      // These uploads set their own limits on the route.
      except(
        [
          "/api/v1/files/pictures/:purpose",
          "/api/v1/meetings/import",
          "/api/mobile/files/pictures/:purpose",
          "/api/mobile/meetings/import",
        ],
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
    .use("/api/mobile/*", trustedOrigin(trustedOrigins))
    .on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))
    .route("/desktop", createDesktopRoutes(services.desktop))
    .route("/api/v1", products)
    .route("/api/mobile", products)
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
