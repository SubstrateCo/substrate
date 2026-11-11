import { publicFailure } from "@substrate/contracts/result";

import { respond } from "./http";
import { ServiceError } from "./service-result";
import { createMiddleware } from "hono/factory";

export function isTrustedOrigin(
  origin: string | null | undefined,
  trustedOrigins: readonly string[],
) {
  return !!origin && trustedOrigins.includes(origin);
}

export function requireOrigin(headers: Headers, trustedOrigins: readonly string[]) {
  if (!isTrustedOrigin(headers.get("origin"), trustedOrigins))
    throw new ServiceError("FORBIDDEN", "Invalid request origin.");
}

export function trustedOrigin(trustedOrigins: readonly string[]) {
  return createMiddleware(async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      try {
        requireOrigin(c.req.raw.headers, trustedOrigins);
      } catch {
        return respond(c, publicFailure("FORBIDDEN", "Invalid request origin."));
      }
    }
    await next();
  });
}
