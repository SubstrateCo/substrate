import { desktopPath } from "@substrate/contracts/desktop/links";

import { respond, validationHook } from "../shared/http";
import type { DesktopService } from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { html } from "hono/html";
import { z } from "zod";

export function createDesktopRoutes(service: DesktopService) {
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
    .get("/release", (c) => respond(c, service.release()))
    .get("/download", (c) => {
      const result = service.downloadURL();
      if (!result.success) return respond(c, result);
      return c.redirect(result.data, 303);
    })
    .get("/open", zValidator("query", z.object({ path: desktopPath }), validationHook), (c) => {
      const { link, browserURL, downloadURL } = service.open(c.req.valid("query").path);
      return c.html(
        html`<!doctype html>
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Open Substrate</title>
            </head>
            <body>
              <main>
                <h1>Continue in Substrate</h1>
                <p>Open the desktop app, or finish setup in your browser before installing.</p>
                <p><a href="${link}" rel="noreferrer">Open Substrate</a></p>
                <p><a href="${browserURL}" rel="noreferrer">Continue in browser</a></p>
                <p><a href="${downloadURL}" rel="noreferrer">Download Substrate</a></p>
                <p>After installing, return to this page and choose Open Substrate.</p>
              </main>
            </body>
          </html>`,
      );
    });
}
