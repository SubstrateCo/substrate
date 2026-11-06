import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { guestSessionRedirect, verifiedSessionAccess } from "./session-policy";
import { getSession } from "@/api/session";
import { queryKeys } from "@/queries/keys";

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.session,
    queryFn: ({ signal }) => getSession(signal),
    staleTime: 0,
    retry: false,
  });

export async function requireVerifiedSession(queryClient: QueryClient, destination: string) {
  const session = await queryClient.query(sessionQueryOptions());
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
