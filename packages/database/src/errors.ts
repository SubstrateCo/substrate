import postgres from "postgres";

export class AppDisabledError extends Error {
  constructor() {
    super("This app is disabled for this organization.");
    this.name = "AppDisabledError";
  }
}

function postgresError(error: Error) {
  if (error instanceof postgres.PostgresError) return error;
  if (error.cause instanceof postgres.PostgresError) return error.cause;
  return undefined;
}

/** The SQLSTATE code of a failed statement, or undefined for any other error. */
export function postgresErrorCode(error: Error) {
  return postgresError(error)?.code;
}

/** The constraint a failed statement violated, or undefined for any other error. */
export function violatedConstraint(error: Error) {
  return postgresError(error)?.constraint_name;
}

export function isUniqueViolation(error: Error, constraint?: string) {
  const pg = postgresError(error);
  if (pg?.code !== "23505") return false;
  return constraint === undefined || pg.constraint_name === constraint;
}

export function isForeignKeyViolation(error: Error, constraint?: string) {
  const pg = postgresError(error);
  if (pg?.code !== "23503") return false;
  return constraint === undefined || pg.constraint_name === constraint;
}

export function isInvalidTextRepresentation(error: Error) {
  return postgresError(error)?.code === "22P02";
}

export interface PostgresErrorMapping {
  unique?: string;
  uniqueConstraint?: Partial<Record<string, string>>;
  foreignKey?: string;
  foreignKeyConstraint?: Partial<Record<string, string>>;
  invalidInput?: string;
}

export function mapPostgresError(error: Error, messages: PostgresErrorMapping): never {
  const pg = postgresError(error);
  if (pg?.code === "23505") {
    const specific = pg.constraint_name
      ? messages.uniqueConstraint?.[pg.constraint_name]
      : undefined;
    const message = specific ?? messages.unique;
    if (message) throw new ConflictError(message);
  }
  if (pg?.code === "23503") {
    const specific = pg.constraint_name
      ? messages.foreignKeyConstraint?.[pg.constraint_name]
      : undefined;
    const message = specific ?? messages.foreignKey;
    if (message) throw new ValidationError(message);
  }
  if (pg?.code === "22P02" && messages.invalidInput) {
    throw new ValidationError(messages.invalidInput);
  }
  throw error;
}

export class AccessDeniedError extends Error {
  constructor() {
    super("Entity not found or access denied.");
    this.name = "AccessDeniedError";
  }
}

/** The record is visible, but the action needs a role the scope does not have. */
export class PermissionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionRequiredError";
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
