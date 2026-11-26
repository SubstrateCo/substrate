import type { HarnessErrorCode } from "@substrate/contracts/harness-runtime";

export class HarnessError extends Error {
  constructor(code: HarnessErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "HarnessError";
    this.code = code;
  }
  readonly code: HarnessErrorCode;
}

export function unsupported(message: string): never {
  throw new HarnessError("unsupported-capability", message);
}
