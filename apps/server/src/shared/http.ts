import {
  failure,
  publicFailure,
  type ServiceErrorCode,
  type ServiceResult,
} from "@substrate/contracts/result";

import { zValidator, type Hook } from "@hono/zod-validator";
import type { Context, Env, ValidationTargets } from "hono";
import type { UnofficialStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

const statuses = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  APP_DISABLED: 403,
  WORKSPACE_CHANGED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ServiceErrorCode, number>;

export function respond<T extends ServiceResult<unknown>>(c: Context, result: T) {
  return c.json(result, result.success ? 200 : statuses[result.error.code]);
}

/**
 * Accepted for later, not failed: an agent tool call that waits for the owner's approval. The
 * body keeps the result envelope, so the agent reads its code and request ID.
 */
export function respondAccepted<T extends { success: false }>(c: Context, body: T) {
  return c.json(body, 202);
}

/** Runs work with the request's abort signal and answers 499 when the client cancelled it. */
export async function respondCancellable<T extends ServiceResult<unknown>>(
  c: Context,
  work: (signal: AbortSignal) => Promise<T>,
) {
  const signal = c.req.raw.signal;
  try {
    return respond(c, await work(signal));
  } catch (error) {
    if (signal.aborted) {
      // SAFETY: Hono uses this marker for unofficial statuses; 499 means client cancellation.
      return c.json(failure("INVALID_INPUT", "Request cancelled."), 499 as UnofficialStatusCode);
    }
    throw error;
  }
}

export const validationHook = ((result, c) => {
  if (!result.success) return respond(c, publicFailure("INVALID_INPUT", "Invalid request input."));
}) satisfies Hook<unknown, Env, string>;

export const v = <T extends keyof ValidationTargets, S extends z.ZodType>(target: T, schema: S) =>
  zValidator(target, schema, validationHook);
