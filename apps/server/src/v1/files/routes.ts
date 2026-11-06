import { createUploadInput, fileIdInput, uploadIdParam } from "@startup-os/contracts/files/input";

import { respond, validationHook } from "../../shared/http";
import { defaultFileService } from "./default-service";
import type { FileService } from "./service";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createFilesRoutes(service: FileService = defaultFileService) {
  return new Hono()
    .post("/uploads", zValidator("json", createUploadInput, validationHook), async (c) =>
      respond(c, await service.createUpload(c.req.raw.headers, c.req.valid("json"))),
    )
    .post("/uploads/:id/complete", zValidator("param", uploadIdParam, validationHook), async (c) =>
      respond(c, await service.completeUpload(c.req.raw.headers, c.req.valid("param").id)),
    )
    .post("/avatar", zValidator("json", fileIdInput, validationHook), async (c) =>
      respond(c, await service.setPicture(c.req.raw.headers, "avatar", c.req.valid("json").fileId)),
    )
    .delete("/avatar", async (c) =>
      respond(c, await service.setPicture(c.req.raw.headers, "avatar", null)),
    )
    .post("/organization-logo", zValidator("json", fileIdInput, validationHook), async (c) =>
      respond(
        c,
        await service.setPicture(
          c.req.raw.headers,
          "organization-logo",
          c.req.valid("json").fileId,
        ),
      ),
    )
    .delete("/organization-logo", async (c) =>
      respond(c, await service.setPicture(c.req.raw.headers, "organization-logo", null)),
    )
    .delete("/:id", zValidator("param", uploadIdParam, validationHook), async (c) =>
      respond(c, await service.deleteFile(c.req.raw.headers, c.req.valid("param").id)),
    )
    .get("/:id/content", zValidator("param", uploadIdParam, validationHook), async (c) => {
      const result = await service.content(c.req.raw.headers, c.req.valid("param").id);
      if (!result.success) return respond(c, result);
      c.header("Cache-Control", "private, no-store");
      c.header("Vary", "Cookie");
      return c.redirect(result.data.url, 302);
    });
}
