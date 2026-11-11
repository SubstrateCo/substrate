import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { guestSessionRedirect, verifiedSessionAccess } from "./session-policy";
import type { getSession } from "@/api/auth/session";
import { sessionQueryOptions } from "@/queries/auth/session";

export async function requireVerifiedSession(
  queryClient: QueryClient,
  destination: string,
): Promise<NonNullable<Awaited<ReturnType<typeof getSession>>>> {
  // Realtime session and access events, reconnect resyncs, and full-document auth changes keep a
  // verified session current. Recheck a missing or unverified one, since no event reports email verification.
  const session = await queryClient.query({
    ...sessionQueryOptions(),
    staleTime: (query) => (query.state.data?.user.emailVerified ? Infinity : 0),
  });
  const access = verifiedSessionAccess(session, destination);
  if ("redirect" in access) throw redirect({ href: access.redirect });
  return access.session;
}

export async function redirectAuthenticatedSession(queryClient: QueryClient, destination: string) {
  const session = await queryClient.query(sessionQueryOptions());
  const href = guestSessionRedirect(session, destination);
  if (href) throw redirect({ href });
  return null;
}
