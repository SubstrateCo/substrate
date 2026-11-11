import type { RealtimeReceiver } from "@substrate/database/realtime";

interface SessionAPI {
  getSession(input: { headers: Headers; query: { disableCookieCache: true } }): Promise<{
    user: { id: string; emailVerified: boolean };
    session: { activeOrganizationId?: string | null };
  } | null>;
}

export function createRealtimeAuthenticator(
  api: SessionAPI,
  resolveReceiver: (identity: {
    userId: string;
    organizationId: string | null;
  }) => Promise<RealtimeReceiver | null>,
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
    return resolveReceiver({ userId: session.user.id, organizationId });
  };
}
