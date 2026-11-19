import { serviceErrorKind } from "@substrate/contracts/result";

import { AuthError, isAuthAccessFailure, isAuthInvitationUnavailable } from "./auth/error";
import { ApiError } from "./result";

export function isAccessFailure(error: Error | null | undefined): boolean {
  if (!error) return false;
  if (error instanceof ApiError && serviceErrorKind(error.code) === "access") return true;
  if (error instanceof AuthError && isAuthAccessFailure(error)) return true;
  const status = "status" in error ? error.status : undefined;
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === "FORBIDDEN" ||
    status === "UNAUTHORIZED"
  );
}

export function isInvitationUnavailable(error: Error | null | undefined): boolean {
  return error instanceof AuthError && isAuthInvitationUnavailable(error);
}
