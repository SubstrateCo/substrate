/**
 * Better Auth refuses an invitation only once `expiresAt` is earlier than now, so the expiry
 * instant itself is still acceptable. `useExpiryTime` changes `now` just after that instant.
 */
export function isInvitationExpired(expiresAt: string | Date, now: number) {
  return new Date(expiresAt).getTime() < now;
}

/** What the accept-invitation screen shows. */
export type InvitationScreenState<T> =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "missing" }
  | { kind: "ready"; invitation: T };

/**
 * An invitation that Better Auth refuses, or that is no longer pending or has expired, is
 * missing. A failed refresh keeps a loaded invitation on screen.
 */
export function invitationScreenState<T extends { expiresAt: string | Date; status: string }>({
  invitation,
  unavailable,
  failed,
  now,
}: {
  invitation: T | undefined;
  unavailable: boolean;
  failed: boolean;
  now: number;
}): InvitationScreenState<T> {
  if (unavailable) return { kind: "missing" };
  if (invitation) {
    if (invitation.status !== "pending" || isInvitationExpired(invitation.expiresAt, now))
      return { kind: "missing" };
    return { kind: "ready", invitation };
  }
  if (failed) return { kind: "error" };
  return { kind: "loading" };
}
