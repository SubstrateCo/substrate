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
  | { success: false; error: { code: ServiceErrorCode; message: string } };

export function success<T>(data: T): Extract<ServiceResult<T>, { success: true }> {
  return { success: true, data };
}

export function failure(
  code: ServiceErrorCode,
  message: string,
): Extract<ServiceResult<never>, { success: false }> {
  return { success: false, error: { code, message } };
}
