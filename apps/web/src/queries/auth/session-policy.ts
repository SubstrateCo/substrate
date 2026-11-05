import type { getSession } from "@/server/session";
import { authHref, safeRedirect } from "@/lib/auth-navigation";

type Session = Awaited<ReturnType<typeof getSession>>;

export function verifiedSessionAccess(
  session: Session,
  destination: string,
): { redirect: string } | { session: NonNullable<Session> } {
  if (!session) return { redirect: authHref("/login", destination) };
  if (!session.user.emailVerified) {
    return { redirect: authHref("/verify-email", destination, session.user.email) };
  }
  return { session };
}

export function guestSessionRedirect(session: Session, destination: string) {
  if (!session) return null;
  const fallback = session.session.activeOrganizationId ? "/dashboard" : "/organizations";
  let target = safeRedirect(destination, fallback);
  const pathname = decodeURIComponent(new URL(target, "https://startup.invalid").pathname);
  if (/^\/(login|signup)\/?$/i.test(pathname)) target = fallback;
  if (!session.user.emailVerified) {
    return authHref("/verify-email", target, session.user.email);
  }
  if (target === "/dashboard" && !session.session.activeOrganizationId) target = "/organizations";
  return target;
}
