import type { getSession } from "@/api/auth/session";
import { authLink, safeRedirect } from "@/lib/auth/navigation";

type Session = Awaited<ReturnType<typeof getSession>>;

export function verifiedSessionAccess(session: Session, destination: string) {
  if (!session) return { redirect: authLink("/login", destination) };
  if (!session.user.emailVerified) {
    return { redirect: authLink("/verify-email", destination, session.user.email) };
  }
  return { session };
}

export function guestSessionRedirect(session: Session, destination: string) {
  if (!session) return null;
  const fallback = session.session.activeOrganizationId ? "/messages" : "/organizations";
  let target = safeRedirect(destination, fallback);
  const pathname = decodeURIComponent(new URL(target, "https://startup.invalid").pathname);
  if (/^\/(login|signup)\/?$/i.test(pathname)) target = fallback;
  if (!session.user.emailVerified) {
    return authLink("/verify-email", target, session.user.email);
  }
  if (target === "/messages" && !session.session.activeOrganizationId) target = "/organizations";
  return { href: target };
}
