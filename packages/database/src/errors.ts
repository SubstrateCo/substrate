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
