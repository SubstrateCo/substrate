import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import type { getSession } from "@/api/auth/session";
import { guestSessionRedirect, verifiedSessionAccess } from "@/lib/auth/session-policy";
import { sessionQueryOptions } from "@/queries/auth/session";

type Session = Awaited<ReturnType<typeof getSession>>;

const trustUntilInvalidated = Infinity;
const alwaysRecheck = 0;
const verifiedSessionStaleTime = (session: Session | undefined) =>
  session?.user.emailVerified ? trustUntilInvalidated : alwaysRecheck;

export async function requireVerifiedSession(
  queryClient: QueryClient,
  destination: string,
  options = sessionQueryOptions(),
): Promise<NonNullable<Session>> {
  const session = await queryClient.query({
    ...options,
    staleTime: (query) => verifiedSessionStaleTime(query.state.data),
  });
  const access = verifiedSessionAccess(session, destination);
  if (access.redirect) throw redirect(access.redirect);
  return access.session;
}

export async function redirectAuthenticatedSession(queryClient: QueryClient, destination: string) {
  const session = await queryClient.query(sessionQueryOptions());
  const target = guestSessionRedirect(session, destination);
  if (!target) return null;
  throw "href" in target ? redirect({ href: target.href }) : redirect(target);
}
