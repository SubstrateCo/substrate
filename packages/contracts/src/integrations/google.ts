/**
 * Google products whose grants the Substrate server may hold. Inbox has a separate native
 * desktop grant; Gmail scopes must not be added to this registry.
 */
export const googleProducts = ["calendar"] as const;
export type GoogleProduct = (typeof googleProducts)[number];

/** Identity scopes of a server-linked Google account. Better Auth reads the ID token from `openid`. */
export const googleBaseScopes = ["openid", "email", "profile"] as const;

/** The scopes each product needs, in addition to the base scopes. */
export const googleProductScopes = {
  calendar: ["https://www.googleapis.com/auth/calendar.readonly"],
} as const satisfies Record<GoogleProduct, readonly string[]>;

/**
 * The scopes in a stored grant. Better Auth stores `account.scope` comma-separated; OAuth token
 * responses separate scopes with spaces. Both forms are accepted.
 */
export function parseGrantedScopes(scope: string | null): string[] {
  return (scope ?? "").split(/[\s,]+/).filter(Boolean);
}

/** The products whose scopes the grant includes in full. */
export function grantedGoogleProducts(scope: string | null): GoogleProduct[] {
  const granted = new Set(parseGrantedScopes(scope));
  return googleProducts.filter((product) =>
    googleProductScopes[product].every((required) => granted.has(required)),
  );
}

export function hasGoogleProduct(scope: string | null, product: GoogleProduct) {
  return grantedGoogleProducts(scope).includes(product);
}
