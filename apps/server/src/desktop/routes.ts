import { desktopPath } from "@substrate/contracts/desktop/links";

import { htmlPage, setHtmlPageHeaders } from "../shared/html-page";
import { respond, validationHook } from "../shared/http";
import type { DesktopService } from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

export function createDesktopRoutes(service: DesktopService) {
  return new Hono()
    .use(async (c, next) => {
      setHtmlPageHeaders(c);
      await next();
    })
    .get("/release", (c) => respond(c, service.release()))
    .get(
      "/download",
      zValidator(
        "query",
        z.object({ platform: z.enum(["windows", "mac"]).default("windows") }),
        validationHook,
      ),
      (c) => {
        const result = service.downloadURL(c.req.valid("query").platform);
        if (!result.success) return respond(c, result);
        return c.redirect(result.data, 303);
      },
    )
    .get("/open", zValidator("query", z.object({ path: desktopPath }), validationHook), (c) => {
      const { link, browserURL, downloadURL } = service.open(c.req.valid("query").path);
      return c.html(
        htmlPage({
          title: "Continue in Substrate",
          paragraphs: [
            "Open the desktop app, or finish setup in your browser before installing.",
            "After installing, return to this page and choose Open Substrate.",
          ],
          actions: [
            { label: "Open Substrate", href: link, primary: true },
            { label: "Continue in browser", href: browserURL },
            { label: "Download Substrate", href: downloadURL },
          ],
        }),
      );
    });
}
