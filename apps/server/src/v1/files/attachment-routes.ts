import {
  addTaskAttachments,
  taskAttachmentTarget,
  taskAttachmentRequest,
  messageAttachmentRequest,
} from "@substrate/contracts/files/attachments";
import type { ServiceResult } from "@substrate/contracts/result";

import { fileDisposition } from "../../shared/content-disposition";
import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { AttachmentService } from "./attachments";
import { privateFileResponse } from "./private-response";
import { Hono, type Context } from "hono";

function downloadResponse(
  c: Context,
  result: ServiceResult<{ filename: string; bytes: Uint8Array }>,
) {
  if (!result.success) return respond(c, result);
  return privateFileResponse(c, result.data.bytes, {
    disposition: fileDisposition(result.data.filename),
    type: "application/octet-stream",
  });
}

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
    .get("/tasks/source", v("query", taskAttachmentTarget), scopes.workspace("query"), async (c) =>
      respond(c, await services.listTaskSourceAttachments(c.var.scope, c.req.valid("query"))),
    )
    .get(
      "/tasks/content",
      v("query", taskAttachmentRequest),
      scopes.workspace("query"),
      async (c) =>
        downloadResponse(
          c,
          await services.taskAttachmentContent(c.var.scope, c.req.valid("query")),
        ),
    )
    .get(
      "/messages/preview",
      v("query", messageAttachmentRequest),
      scopes.workspace("query"),
      async (c) => {
        const result = await services.messageAttachmentPreview(c.var.scope, c.req.valid("query"));
        if (!result.success) return respond(c, result);
        return privateFileResponse(c, result.data.bytes, {
          disposition: "inline",
          type: "image/webp",
        });
      },
    )
    .get(
      "/messages/content",
      v("query", messageAttachmentRequest),
      scopes.workspace("query"),
      async (c) =>
        downloadResponse(
          c,
          await services.messageAttachmentContent(c.var.scope, c.req.valid("query")),
        ),
    );
}
