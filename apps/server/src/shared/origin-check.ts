export function isTrustedOrigin(
  origin: string | null | undefined,
  trustedOrigins: readonly string[],
) {
  return !!origin && trustedOrigins.includes(origin);
}
