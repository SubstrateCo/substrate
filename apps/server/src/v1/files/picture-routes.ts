import {
  pictureKindParam,
  pictureOwnerParam,
  pictureUploadInput,
  pictureVersionQuery,
} from "@substrate/contracts/files/pictures";
import { publicFailure } from "@substrate/contracts/result";

import { respond, v } from "../../shared/http";
import type { ScopeEnv, Scopes } from "../../shared/scope";
import type { UserScope } from "../../shared/scope-types";
import type { PictureService } from "./pictures";
import { privateFileResponse, privateRedirect } from "./private-response";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

const pictureKeepSeconds = 24 * 60 * 60;

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
      return privateFileResponse(c, result.data.bytes, {
        disposition: "inline",
        type: "image/webp",
      });
    })
    .get(
      "/:purpose/:owner",
      v("param", pictureOwnerParam),
      v("query", pictureVersionQuery),
      scopes.user(),
      async (c) => {
        const { purpose, owner } = c.req.valid("param");
        if (c.req.valid("query").v) {
          const versioned = await service.bytes(c.var.scope, purpose, owner);
          if (!versioned.success) return respond(c, versioned);
          return privateFileResponse(c, versioned.data.bytes, {
            disposition: "inline",
            type: "image/webp",
            keepSeconds: pictureKeepSeconds,
          });
        }
        const result = await service.content(c.var.scope, purpose, owner);
        if (!result.success) return respond(c, result);
        return privateRedirect(c, result.data.url);
      },
    );
}
