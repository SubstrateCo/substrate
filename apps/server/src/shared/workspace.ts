import { authEnvironment } from "../auth/environment";
import { auth } from "../auth/server";
import { ServiceError } from "./service-result";

export function requireWorkspace(expected: string, active: string | null | undefined) {
  if (!active || active !== expected)
    throw new ServiceError(
      "FORBIDDEN",
      "Your active workspace changed. Reload this page to continue.",
    );
  return active;
}

export function requireOrigin(headers: Headers) {
  const origin = headers.get("origin");
  if (!origin || !authEnvironment().trustedOrigins.includes(origin))
    throw new ServiceError("FORBIDDEN", "Invalid request origin.");
}

export async function workspaceSession(headers: Headers, expectedOrganizationId: string) {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new ServiceError("UNAUTHENTICATED", "Sign in to continue.");
  if (!session.user.emailVerified)
    throw new ServiceError("FORBIDDEN", "Verify your email to continue.");
  const organizationId = requireWorkspace(
    expectedOrganizationId,
    session.session.activeOrganizationId,
  );
  await auth.api.getActiveMemberRole({ headers, query: { organizationId } });
  return { session, organizationId };
}
