import {
  publicFailure,
  type ServiceErrorCode,
  type ServiceResult,
} from "@substrate/contracts/result";

import type { Hook } from "@hono/zod-validator";
import type { Context, Env } from "hono";

const statuses = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  WORKSPACE_CHANGED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ServiceErrorCode, number>;

export function respond<T extends ServiceResult<unknown>>(c: Context, result: T) {
  return c.json(result, result.success ? 200 : statuses[result.error.code]);
}

export const validationHook = ((result, c) => {
  if (!result.success) return respond(c, publicFailure("INVALID_INPUT", "Invalid request input."));
}) satisfies Hook<unknown, Env, string>;
