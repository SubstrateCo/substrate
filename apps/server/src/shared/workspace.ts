import { ServiceError } from "./service-result";

export function requireWorkspace(expected: string, active: string | null | undefined) {
  if (!active || active !== expected)
    throw new ServiceError(
      "WORKSPACE_CHANGED",
      "Your active workspace changed. Reload this page to continue.",
    );
  return active;
}

export function requireVerified<T extends { user: { emailVerified: boolean } }>(session: T | null) {
  if (!session) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
  if (!session.user.emailVerified)
    throw new ServiceError("FORBIDDEN", "Verify your email to continue.", "EMAIL_NOT_VERIFIED");
  return session;
}
