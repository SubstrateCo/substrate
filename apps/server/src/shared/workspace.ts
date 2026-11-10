import { auth } from "../auth/server";
import { environment } from "../environment";
import { ServiceError } from "./service-result";

export function requireWorkspace(expected: string, active: string | null | undefined) {
  if (!active || active !== expected)
    throw new ServiceError(
      "WORKSPACE_CHANGED",
      "Your active workspace changed. Reload this page to continue.",
    );
  return active;
}

export function requireOrigin(headers: Headers) {
  const origin = headers.get("origin");
  if (!origin || !environment.trustedOrigins.includes(origin))
    throw new ServiceError("FORBIDDEN", "Invalid request origin.");
}

// Membership is checked by the database on every workspace path (workspaceContext, active actor
// checks and actor provisioning), so a removed member gets NOT_FOUND there.
export async function workspaceSession(headers: Headers, expectedOrganizationId: string) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
  if (!session.user.emailVerified)
    throw new ServiceError("FORBIDDEN", "Verify your email to continue.");
  const organizationId = requireWorkspace(
    expectedOrganizationId,
    session.session.activeOrganizationId,
  );
  return { session, organizationId };
}
