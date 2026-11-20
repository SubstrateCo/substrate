import {
  failure,
  publicFailure,
  success,
  type ServiceErrorCode,
  type ServiceErrorReason,
  type ServiceResult,
} from "@substrate/contracts/result";
import { AccessDeniedError, ConflictError, ValidationError } from "@substrate/database";

import { APIError } from "better-auth/api";
import { ZodError } from "zod";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly reason?: ServiceErrorReason,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

/** Creates `serviceResult` with a log for unexpected errors. */
export const createServiceResult =
  (log: (message: string, name: string) => void = console.error) =>
  async <T>(work: () => Promise<T>, signal?: AbortSignal): Promise<ServiceResult<T>> => {
    try {
      signal?.throwIfAborted();
      const data = await work();
      signal?.throwIfAborted();
      return success(data);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof ServiceError && error.code !== "INTERNAL_ERROR")
        return publicFailure(error.code, error.message, error.reason);
      if (error instanceof ZodError)
        return publicFailure("INVALID_INPUT", "Invalid request input.");
      if (error instanceof APIError) {
        switch (error.statusCode) {
          case 400:
            return publicFailure("INVALID_INPUT", "Invalid request input.");
          case 401:
            return publicFailure("UNAUTHENTICATED", "Sign in to continue.");
          case 403:
            return publicFailure("FORBIDDEN", "Access denied.");
        }
      }
      if (error instanceof AccessDeniedError)
        return publicFailure("NOT_FOUND", "Item not found or access denied.");
      if (error instanceof ValidationError) return publicFailure("INVALID_INPUT", error.message);
      if (error instanceof ConflictError) return publicFailure("CONFLICT", error.message);
      log("Service operation failed", error instanceof Error ? error.name : "Unknown error");
      return failure("INTERNAL_ERROR", "The operation is unavailable. Please try again.");
    }
  };

export const serviceResult = createServiceResult();
