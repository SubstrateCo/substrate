import {
  addTaskAttachments,
  taskAttachmentTarget,
  taskAttachmentRequest,
  messageAttachmentRequest,
} from "@substrate/contracts/files/attachments";

import { fileDisposition } from "../../shared/content-disposition";
import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { AttachmentService } from "./attachments";
import { Hono } from "hono";

export function createAttachmentRoutes(services: AttachmentService, scopes: Scopes) {
  return new Hono<ScopeEnv>()
    .get("/tasks", v("query", taskAttachmentTarget), scopes.workspace("query"), async (c) =>
      respond(c, await services.listTaskAttachments(c.var.scope, c.req.valid("query"))),
    )
    .post("/tasks", v("json", addTaskAttachments), scopes.workspace("json"), async (c) =>
      respond(c, await services.attachTaskFiles(c.var.scope, c.req.valid("json"))),
    )
    .delete("/tasks", v("json", taskAttachmentRequest), scopes.workspace("json"), async (c) =>
      respond(c, await services.removeTaskAttachment(c.var.scope, c.req.valid("json"))),
    )
    .get(
      "/tasks/content",
      v("query", taskAttachmentRequest),
      scopes.workspace("query"),
      async (c) => {
        const result = await services.taskAttachmentContent(c.var.scope, c.req.valid("query"));
        if (!result.success) return respond(c, result);
        c.header("Cache-Control", "private, no-store");
        c.header("Vary", "Cookie");
        c.header("Content-Disposition", fileDisposition(result.data.filename));
        c.header("Content-Type", "application/octet-stream");
        c.header("X-Content-Type-Options", "nosniff");
        return c.body(new Uint8Array(result.data.bytes));
      },
    )
    .get(
      "/messages/preview",
      v("query", messageAttachmentRequest),
      scopes.workspace("query"),
      async (c) => {
        const result = await services.messageAttachmentPreview(c.var.scope, c.req.valid("query"));
        if (!result.success) return respond(c, result);
        c.header("Cache-Control", "private, no-store");
        c.header("Vary", "Cookie");
        c.header("Content-Disposition", "inline");
        c.header("Content-Type", "image/webp");
        c.header("X-Content-Type-Options", "nosniff");
        return c.body(new Uint8Array(result.data.bytes));
      },
    )
    .get(
      "/messages/content",
      v("query", messageAttachmentRequest),
      scopes.workspace("query"),
      async (c) => {
        const result = await services.messageAttachmentContent(c.var.scope, c.req.valid("query"));
        if (!result.success) return respond(c, result);
        c.header("Cache-Control", "private, no-store");
        c.header("Vary", "Cookie");
        c.header("Content-Disposition", fileDisposition(result.data.filename));
        c.header("Content-Type", "application/octet-stream");
        c.header("X-Content-Type-Options", "nosniff");
        return c.body(new Uint8Array(result.data.bytes));
      },
    );
}
