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

/** Typed auth destinations that preserve the desktop sign-in handoff. */
export function useAuthLink() {
  const authorization = useElectronAuthorization();
  return (to: AuthPath, redirect: string, email?: string) =>
    authLink(to, redirect, email, authorization);
}

/** Builds URLs for auth email callbacks and full-document session exits. */
export function useAuthHref() {
  const router = useRouter();
  const link = useAuthLink();
  return (to: AuthPath, redirect: string, email?: string) =>
    router.buildLocation(link(to, redirect, email)).href;
}
