import postgres from "postgres";

export class AppDisabledError extends Error {
  constructor() {
    super("This app is disabled for this organization.");
    this.name = "AppDisabledError";
  }
}

/** The constraint a failed statement violated, or undefined for any other error. */
export function violatedConstraint(error: Error) {
  return error.cause instanceof postgres.PostgresError ? error.cause.constraint_name : undefined;
}

export class AccessDeniedError extends Error {
  constructor() {
    super("Entity not found or access denied.");
    this.name = "AccessDeniedError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
