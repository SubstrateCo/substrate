import { realtimeKeys } from "@startup-os/contracts/realtime";

import type { HubDependencies } from "./hub";

interface SessionAPI {
  getSession(input: { headers: Headers; query: { disableCookieCache: true } }): Promise<{
    user: { id: string; emailVerified: boolean };
    session: { activeOrganizationId?: string | null };
  } | null>;
}

export function createRealtimeAuthenticator(
  api: SessionAPI,
  canReceive: HubDependencies["canReceive"],
) {
  return async (headers: Headers, organizationId: string | null) => {
    // Never trust a cached cookie snapshot for revocation or active-workspace scope.
    const session = await api.getSession({ headers, query: { disableCookieCache: true } });
    if (
      !session ||
      !session.user.emailVerified ||
      (session.session.activeOrganizationId ?? null) !== organizationId
    )
      return null;
    const identity = { userId: session.user.id, organizationId };
    const audience =
      organizationId === null
        ? realtimeKeys.user(identity.userId)
        : realtimeKeys.organization(organizationId);
    return (await canReceive(identity, audience)) ? identity : null;
  };
}
