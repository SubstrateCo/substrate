import {
  failure,
  success,
  type ServiceErrorCode,
  type ServiceResult,
} from "@substrate/contracts/result";
import { AccessDeniedError, ConflictError, ValidationError } from "@substrate/database";

import { APIError } from "better-auth/api";
import { ZodError } from "zod";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export async function serviceResult<T>(work: () => Promise<T>): Promise<ServiceResult<T>> {
  try {
    return success(await work());
  } catch (error) {
    if (error instanceof ServiceError) return failure(error.code, error.message);
    if (error instanceof ZodError) return failure("INVALID_INPUT", "Invalid request input.");
    if (error instanceof APIError) {
      if (error.statusCode === 400) return failure("INVALID_INPUT", "Invalid request input.");
      if (error.statusCode === 401) return failure("UNAUTHENTICATED", "Sign in to continue.");
      if (error.statusCode === 403) return failure("FORBIDDEN", "Access denied.");
    }
    if (error instanceof AccessDeniedError)
      return failure("NOT_FOUND", "Item not found or access denied.");
    if (error instanceof ValidationError) return failure("INVALID_INPUT", error.message);
    if (error instanceof ConflictError) return failure("CONFLICT", error.message);
    console.error(
      "Service operation failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    return failure("INTERNAL_ERROR", "The operation is unavailable. Please try again.");
  }
}
