import { createUploadInput, uploadIdParam } from "@substrate/contracts/files/input";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes, UserScope } from "../../shared/scope";
import type { FileService } from "./service";
import { Hono } from "hono";

export function createFilesRoutes(service: FileService, scopes: Scopes) {
  // Uploads do not accept an expected workspace; storage uses the active session workspace.
  return new Hono<ScopeEnv<UserScope>>()
    .post("/uploads", v("json", createUploadInput), scopes.user(), async (c) =>
      respond(c, await service.createUpload(c.var.scope, c.req.valid("json"))),
    )
    .post("/uploads/:id/complete", v("param", uploadIdParam), scopes.user(), async (c) =>
      respond(c, await service.completeUpload(c.var.scope, c.req.valid("param").id)),
    )
    .delete("/:id", v("param", uploadIdParam), scopes.user(), async (c) =>
      respond(c, await service.deleteFile(c.var.scope, c.req.valid("param").id)),
    )
    .get("/:id/content", v("param", uploadIdParam), scopes.user(), async (c) => {
      const result = await service.content(c.var.scope, c.req.valid("param").id);
      if (!result.success) return respond(c, result);
      c.header("Cache-Control", "private, no-store");
      c.header("Vary", "Cookie");
      return c.redirect(result.data.url, 302);
    });
}
