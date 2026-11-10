import {
  addTaskAttachments,
  taskAttachmentTarget,
  taskAttachmentRequest,
  messageAttachmentRequest,
} from "@startup-os/contracts/files/attachments";

import { respond, validationHook } from "../../shared/http";
import * as services from "./attachments";
import { fileDisposition } from "./disposition";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

export function createAttachmentRoutes() {
  return new Hono()
    .get("/tasks", zValidator("query", taskAttachmentTarget, validationHook), async (c) =>
      respond(c, await services.listTaskAttachments(c.req.raw.headers, c.req.valid("query"))),
    )
    .post("/tasks", zValidator("json", addTaskAttachments, validationHook), async (c) =>
      respond(c, await services.attachTaskFiles(c.req.raw.headers, c.req.valid("json"))),
    )
    .delete("/tasks", zValidator("json", taskAttachmentRequest, validationHook), async (c) =>
      respond(c, await services.removeTaskAttachment(c.req.raw.headers, c.req.valid("json"))),
    )
    .get(
      "/tasks/content",
      zValidator("query", taskAttachmentRequest, validationHook),
      async (c) => {
        const result = await services.taskAttachmentContent(
          c.req.raw.headers,
          c.req.valid("query"),
        );
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
      "/messages/content",
      zValidator("query", messageAttachmentRequest, validationHook),
      async (c) => {
        const result = await services.messageAttachmentContent(
          c.req.raw.headers,
          c.req.valid("query"),
        );
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
