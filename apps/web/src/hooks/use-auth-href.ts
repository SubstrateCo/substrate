import { useMatch, useRouter } from "@tanstack/react-router";

import { authLink, type AuthPath } from "@/lib/auth/navigation";
import { electronQuery } from "@/lib/desktop/authorization-query";

/** The desktop sign-in handoff from the public auth pages. Undefined on any other page. */
export function useElectronAuthorization() {
  return useMatch({
    from: "/_public",
    shouldThrow: false,
    select: (match) => electronQuery(match.search),
  });
}

/**
 * Builds auth page URLs for full-document navigation and auth email callbacks. The router
 * serializes the search, so the target page's `validateSearch` reads it back unchanged.
 */
export function useAuthHref() {
  const router = useRouter();
  const authorization = useElectronAuthorization();
  return (to: AuthPath, redirect: string, email?: string) =>
    router.buildLocation(authLink(to, redirect, email, authorization)).href;
}
