export class HarnessError extends Error {
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HarnessError";
    this.code = code;
  }
  readonly code: string;
}

export function unsupported(message: string): never {
  throw new HarnessError("unsupported-capability", message);
}
