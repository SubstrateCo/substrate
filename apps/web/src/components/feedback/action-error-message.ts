import { AuthError } from "@/api/auth/error";
import { ApiError, NetworkError } from "@/api/result";

export function actionErrorMessage(
  error: Error,
  fallback = "We couldn’t complete this action. Please try again.",
): string {
  if (error instanceof NetworkError)
    return "Couldn’t reach the server. Check your connection and try again.";
  const status = "status" in error ? error.status : undefined;
  const code = "code" in error ? error.code : undefined;
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  switch (code) {
    case "UNAUTHENTICATED":
      return "Your session ended. Sign in again.";
    case "WORKSPACE_CHANGED":
      return "Your active workspace changed. Reload this page to continue.";
    case "INTERNAL_ERROR":
      return fallback;
  }
  if (error instanceof ApiError || error instanceof AuthError) {
    if (error.status !== undefined && error.status >= 500) return fallback;
    return error.userMessage || fallback;
  }
  return fallback;
}
