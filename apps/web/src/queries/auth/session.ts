import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { getSession } from "@/server/session";
import { queryKeys } from "@/queries/keys";
import { authHref } from "@/lib/auth-navigation";

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.session,
    queryFn: () => getSession(),
    staleTime: 0,
    retry: false,
  });

export async function requireVerifiedSession(queryClient: QueryClient, destination: string) {
  const session = await queryClient.query(sessionQueryOptions());
  if (!session) throw redirect({ href: authHref("/login", destination) });
  if (!session.user.emailVerified) {
    throw redirect({ href: authHref("/verify-email", destination, session.user.email) });
  }
  return session;
}
