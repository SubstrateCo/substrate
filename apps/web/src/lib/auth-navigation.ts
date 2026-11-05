/* Search parameters are untrusted router input. This module is their parsing boundary. */
/* oxlint-disable deslop/no-unknown-parameters, deslop/no-runtime-typeof, deslop/no-unsafe-dictionary-type */
export function safeRedirect(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  try {
    const decoded = decodeURIComponent(value);
    // oxlint-disable-next-line no-control-regex -- Reject URL controls and backslashes before URL normalization.
    if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith("//")) return fallback;
    const url = new URL(value, "https://startup.invalid");
    if (url.origin !== "https://startup.invalid" || url.pathname.startsWith("/api/"))
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function authSearch(search: Record<string, unknown>) {
  return {
    redirect: safeRedirect(search.redirect),
    email: typeof search.email === "string" ? search.email : "",
    token: typeof search.token === "string" ? search.token : "",
    error: typeof search.error === "string" ? search.error : "",
  };
}

export function authHref(path: string, redirect: string, email?: string) {
  const search = new URLSearchParams({ redirect: safeRedirect(redirect) });
  if (email) search.set("email", email);
  return `${path}?${search}`;
}
