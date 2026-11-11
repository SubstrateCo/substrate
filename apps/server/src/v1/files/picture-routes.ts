import {
  pictureKindParam,
  pictureOwnerParam,
  pictureUploadInput,
} from "@substrate/contracts/files/pictures";
import { failure } from "@substrate/contracts/result";

import { respond, validationHook } from "../../shared/http";
import type { PictureService } from "./pictures";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

export function createPictureRoutes(service: PictureService) {
  return new Hono()
    .post(
      "/:purpose",
      bodyLimit({
        maxSize: 6 * 1024 * 1024,
        onError: (c) => respond(c, failure("PAYLOAD_TOO_LARGE", "Use a picture up to 5 MB.")),
      }),
      zValidator("param", pictureKindParam, validationHook),
      zValidator("form", pictureUploadInput, validationHook),
      async (c) =>
        respond(
          c,
          await service.upload(
            c.req.raw.headers,
            c.req.valid("param").purpose,
            c.req.valid("form").file,
            c.req.valid("form").organizationId,
            c.req.valid("form").projectEntityId,
          ),
        ),
    )
    .get("/:purpose/:owner", zValidator("param", pictureOwnerParam, validationHook), async (c) => {
      const { purpose, owner } = c.req.valid("param");
      const result = await service.content(c.req.raw.headers, purpose, owner);
      if (!result.success) return respond(c, result);
      c.header("Cache-Control", "private, no-store");
      c.header("Vary", "Cookie");
      return c.redirect(result.data.url, 302);
    });
}
