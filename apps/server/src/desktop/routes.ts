import { desktopPath } from "@startup-os/contracts/desktop/links";

import { respond, validationHook } from "../shared/http";
import { openDesktop } from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { html } from "hono/html";
import { z } from "zod";

export function createDesktopRoutes() {
  return new Hono()
    .use(async (c, next) => {
      c.header("Cache-Control", "no-store");
      c.header("Referrer-Policy", "no-referrer");
      c.header(
        "Content-Security-Policy",
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      );
      c.header("X-Content-Type-Options", "nosniff");
      await next();
    })
    .get("/open", zValidator("query", z.object({ path: desktopPath }), validationHook), (c) => {
      const result = openDesktop(c.req.valid("query").path);
      if (!result.success) return respond(c, result);
      return c.html(
        html`<!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Open Startup OS</title>
            </head>
            <body>
              <main>
                <h1>Continue in Startup OS</h1>
                <p>Open the desktop app to continue securely.</p>
                <p><a href="${result.data.link}" rel="noreferrer">Open Startup OS</a></p>
              </main>
            </body>
          </html>`,
      );
    });
}
