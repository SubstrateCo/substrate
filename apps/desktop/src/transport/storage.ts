export function storageOrigins(value: string | string[] | undefined, packaged: boolean): string[] {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : value.split(",");
  return [
    ...new Set(
      values.map((entry) => {
        if (!entry.trim()) throw new Error("Invalid storage origin.");
        const url = new URL(entry.trim());
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        const hasCredentials = url.username || url.password;
        const hasPathQueryOrFragment = url.pathname !== "/" || url.search || url.hash;
        const isCspSafe = !/[\s;'"*]/.test(url.origin);
        const isSafeBareOrigin = !hasCredentials && !hasPathQueryOrFragment && isCspSafe;
        const isAllowedProtocol =
          url.protocol === "https:" || (url.protocol === "http:" && loopback && !packaged);
        if (!isSafeBareOrigin || !isAllowedProtocol) {
          throw new Error(
            "Storage origins must use HTTPS (loopback HTTP is allowed only in development).",
          );
        }
        return url.origin;
      }),
    ),
  ];
}

export function storageRequest(
  origins: string[],
  fetchStorage: (request: Request, init: RequestInit) => Promise<Response>,
) {
  return async (request: Request) => {
    const url = new URL(request.url);
    const hasCredentials = url.username || url.password;
    const isAllowedMethod = ["GET", "HEAD", "PUT", "OPTIONS"].includes(request.method);
    if (!origins.includes(url.origin) || hasCredentials || !isAllowedMethod) {
      return new Response("Forbidden", { status: 403 });
    }
    const headers = new Headers(request.headers);
    for (const name of ["cookie", "authorization", "proxy-authorization"]) headers.delete(name);
    return fetchStorage(request, { headers, credentials: "omit", redirect: "error" });
  };
}
