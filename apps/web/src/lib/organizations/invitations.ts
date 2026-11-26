/**
 * Better Auth refuses an invitation only once `expiresAt` is earlier than now, so the expiry
 * instant itself is still acceptable. `useExpiryTime` changes `now` just after that instant.
 */
export function isInvitationExpired(expiresAt: string | Date, now: number) {
  return new Date(expiresAt).getTime() < now;
}
