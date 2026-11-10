import { desktopPath } from "@startup-os/contracts/desktop/links";
import { failure, success } from "@startup-os/contracts/result";

import { environment, type ServerEnvironment } from "../environment";
import { respond, validationHook } from "../shared/http";
import { openDesktop } from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { html } from "hono/html";
import { z } from "zod";

export function createDesktopRoutes(
  config: Pick<ServerEnvironment, "webURL" | "windowsDownloadURL"> = environment,
) {
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
    .get("/release", (c) =>
      respond(c, success({ windowsAvailable: Boolean(config.windowsDownloadURL) })),
    )
    .get("/download", (c) => {
      if (!config.windowsDownloadURL)
        return respond(c, failure("NOT_FOUND", "The Windows installer is not available yet."));
      return c.redirect(config.windowsDownloadURL, 303);
    })
    .get("/open", zValidator("query", z.object({ path: desktopPath }), validationHook), (c) => {
      const result = openDesktop(c.req.valid("query").path);
      if (!result.success) return respond(c, result);
      const browserURL = new URL(c.req.valid("query").path, config.webURL).toString();
      const downloadURL = new URL("/download", config.webURL);
      downloadURL.searchParams.set("redirect", c.req.valid("query").path);
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
                <p>Open the desktop app, or finish setup in your browser before installing.</p>
                <p><a href="${result.data.link}" rel="noreferrer">Open Startup OS</a></p>
                <p><a href="${browserURL}" rel="noreferrer">Continue in browser</a></p>
                <p><a href="${downloadURL.toString()}" rel="noreferrer">Download Startup OS</a></p>
                <p>After installing, return to this page and choose Open Startup OS.</p>
              </main>
            </body>
          </html>`,
      );
    });
}
