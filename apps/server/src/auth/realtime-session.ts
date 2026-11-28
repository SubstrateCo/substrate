import type { RealtimeReceiver } from "@substrate/database/realtime";

export interface RealtimeSessionAPI {
  getSession(input: {
    headers: Headers;
    query: { disableCookieCache: true; disableRefresh: true };
  }): Promise<{
    user: { id: string; emailVerified: boolean };
    session: { activeOrganizationId?: string | null };
  } | null>;
}

export function createRealtimeAuthenticator(
  api: RealtimeSessionAPI,
  resolveReceiver: (identity: {
    userId: string;
    organizationId: string | null;
  }) => Promise<RealtimeReceiver | null>,
) {
  return async (headers: Headers, organizationId: string | null) => {
    const session = await api.getSession({
      headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
    if (
      !session ||
      !session.user.emailVerified ||
      (session.session.activeOrganizationId ?? null) !== organizationId
    )
      return null;
    return resolveReceiver({ userId: session.user.id, organizationId });
  };
}
