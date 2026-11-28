import { useMatch, useRouter } from "@tanstack/react-router";

import { authLink, type AuthPath } from "@/lib/auth/navigation";
import { electronQuery } from "@/lib/desktop/authorization-query";

export function useElectronAuthorization() {
  return useMatch({
    from: "/_public",
    shouldThrow: false,
    select: (match) => electronQuery(match.search),
  });
}

export function useAuthLink() {
  const authorization = useElectronAuthorization();
  return (to: AuthPath, redirect: string, email?: string) =>
    authLink(to, redirect, email, authorization);
}

export function useAuthHref() {
  const router = useRouter();
  const link = useAuthLink();
  return (to: AuthPath, redirect: string, email?: string) =>
    router.buildLocation(link(to, redirect, email)).href;
}
