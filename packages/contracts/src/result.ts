export type ServiceErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  /** The request names a workspace that is no longer the session's active one. */
  | "WORKSPACE_CHANGED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: ServiceFailure };

export type ServiceErrorReason = "EMAIL_NOT_VERIFIED";

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
