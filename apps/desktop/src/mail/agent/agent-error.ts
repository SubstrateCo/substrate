/** Only reviewed, non-sensitive mail errors cross the agent tool boundary. */
export class InboxToolError extends Error {
  readonly code: "INVALID_INPUT" | "NOT_FOUND" | "APP_DISABLED" | "FORBIDDEN" | "UNAVAILABLE";
  constructor(code: InboxToolError["code"], message: string) {
    super(message);
    this.code = code;
  }
}
