import { APIError } from "better-auth/api";
import { ZodError } from "zod";
import {
  failure,
  success,
  type ServiceErrorCode,
  type ServiceResult,
} from "@startup-os/contracts/result";

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
      if (error.statusCode === 401) return failure("UNAUTHENTICATED", "Sign in to continue.");
      if (error.statusCode === 403) return failure("FORBIDDEN", "Access denied.");
    }
    if (error instanceof Error) {
      if (error.name === "AccessDeniedError")
        return failure("NOT_FOUND", "Item not found or access denied.");
      if (error.name === "ValidationError") return failure("INVALID_INPUT", error.message);
      if (error.name === "ConflictError") return failure("CONFLICT", error.message);
    }
    console.error(
      "Service operation failed",
      error instanceof Error ? error.name : "Unknown error",
    );
    return failure("INTERNAL_ERROR", "The operation is unavailable. Please try again.");
  }
}
