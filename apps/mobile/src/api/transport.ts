export function createAuthenticatedFetch({
  baseURL,
  native,
  origin,
  getCookie,
  fetch,
  onUnauthorized,
  isOnline = () => true,
}: {
  baseURL: string;
  native: boolean;
  origin: string;
  getCookie: () => string | Promise<string>;
  fetch: Fetch;
  onUnauthorized?: () => void;
  isOnline?: () => boolean;
}): typeof globalThis.fetch {
  const trusted = new URL(baseURL).origin;
  const authenticated: Fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const credentials = url.username || url.password;
    if (url.origin !== trusted || credentials || !url.pathname.startsWith("/api/"))
      throw new Error("Authenticated transport only accepts this server's API URLs.");
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const write = !["GET", "HEAD", "OPTIONS"].includes(method);
    if (write && !isOnline())
      throw new Error("You are offline. Reconnect, then send this change again.");
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    headers.delete("cookie");
    if (native) {
      const cookie = await getCookie();
      if (write && !isOnline())
        throw new Error("You are offline. Reconnect, then send this change again.");
      if (cookie) headers.set("Cookie", cookie);
      headers.set("Origin", origin);
    }
    const response = await fetch(input, {
      ...init,
      headers,
      credentials: native ? "omit" : "include",
      redirect: "error",
    });
    if (response.status === 401) onUnauthorized?.();
    return response;
  };
  return Object.assign(authenticated, globalThis.fetch);
}
export type Fetch = (
  ...args: Parameters<typeof globalThis.fetch>
) => ReturnType<typeof globalThis.fetch>;
