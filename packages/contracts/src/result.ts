export const serviceErrorCodes = [
  "INVALID_INPUT",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "APP_DISABLED",
  /** The request names a workspace that is no longer the session's active one. */
  "WORKSPACE_CHANGED",
  "NOT_FOUND",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL_ERROR",
] as const;

export type ServiceErrorCode = (typeof serviceErrorCodes)[number];
export type ServiceErrorKind = "access" | "validation" | "conflict" | "server";

export const serviceErrorKinds = {
  INVALID_INPUT: "validation",
  UNAUTHENTICATED: "access",
  FORBIDDEN: "access",
  APP_DISABLED: "access",
  WORKSPACE_CHANGED: "access",
  NOT_FOUND: "access",
  CONFLICT: "conflict",
  PAYLOAD_TOO_LARGE: "validation",
  INTERNAL_ERROR: "server",
} as const satisfies Record<ServiceErrorCode, ServiceErrorKind>;

export function serviceErrorKind(code: ServiceErrorCode): ServiceErrorKind {
  return serviceErrorKinds[code];
}

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceFailure };

/** CALENDAR_ACCESS_REQUIRED: reconnect the provider account and grant calendar access. */
export type ServiceErrorReason = "EMAIL_NOT_VERIFIED" | "CALENDAR_ACCESS_REQUIRED";

export type ServiceFailure = {
  code: ServiceErrorCode;
  message: string;
  userMessage?: string;
  reason?: ServiceErrorReason;
};

export function success<T>(data: T): Extract<ServiceResult<T>, { success: true }> {
  return { success: true, data };
}

export function failure(
  code: ServiceErrorCode,
  message: string,
): Extract<ServiceResult<never>, { success: false }> {
  return { success: false, error: { code, message } };
}

/** Construct an expected failure with copy that is safe to display to the user. */
export function publicFailure(
  code: Exclude<ServiceErrorCode, "INTERNAL_ERROR">,
  userMessage: string,
  reason?: ServiceErrorReason,
): Extract<ServiceResult<never>, { success: false }> {
  const error: ServiceFailure = {
    code,
    message: userMessage,
    userMessage,
  };
  if (reason) error.reason = reason;
  return { success: false, error };
}
