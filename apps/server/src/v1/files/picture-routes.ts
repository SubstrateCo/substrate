import {
  pictureKindParam,
  pictureOwnerParam,
  pictureUploadInput,
} from "@substrate/contracts/files/pictures";
import { publicFailure } from "@substrate/contracts/result";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { UserScope } from "../../shared/scope-types";
import type { PictureService } from "./pictures";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

export function createPictureRoutes(service: PictureService, scopes: Scopes) {
  return new Hono<ScopeEnv<UserScope>>()
    .post(
      "/:purpose",
      bodyLimit({
        maxSize: 6 * 1024 * 1024,
        onError: (c) => respond(c, publicFailure("PAYLOAD_TOO_LARGE", "Use a picture up to 5 MB.")),
      }),
      v("param", pictureKindParam),
      v("form", pictureUploadInput),
      scopes.user(),
      async (c) => {
        const { file, organizationId, projectEntityId } = c.req.valid("form");
        const bytes = new Uint8Array(await file.arrayBuffer());
        return respond(
          c,
          await service.upload(
            c.var.scope,
            c.req.valid("param").purpose,
            { bytes, contentType: file.type },
            organizationId,
            projectEntityId,
          ),
        );
      },
    )
    .get("/:purpose/:owner/bytes", v("param", pictureOwnerParam), scopes.user(), async (c) => {
      const { purpose, owner } = c.req.valid("param");
      const result = await service.bytes(c.var.scope, purpose, owner);
      if (!result.success) return respond(c, result);
      c.header("Cache-Control", "private, no-store");
      c.header("Vary", "Cookie");
      c.header("Content-Type", "image/webp");
      c.header("Content-Disposition", "inline");
      c.header("X-Content-Type-Options", "nosniff");
      return c.body(new Uint8Array(result.data.bytes));
    })
    .get("/:purpose/:owner", v("param", pictureOwnerParam), scopes.user(), async (c) => {
      const { purpose, owner } = c.req.valid("param");
      const result = await service.content(c.var.scope, purpose, owner);
      if (!result.success) return respond(c, result);
      c.header("Cache-Control", "private, no-store");
      c.header("Vary", "Cookie");
      return c.redirect(result.data.url, 302);
    });
}
