/** @param {unknown} value @param {boolean} packaged @returns {string[]} */
export function storageOrigins(value, packaged) {
  if (value === undefined) return [];
  // oxlint-disable-next-line deslop/no-runtime-typeof -- Public config/env boundary: parse comma-separated env text or a JSON array before validating each origin.
  const values = typeof value === "string" ? value.split(",") : value;
  if (!Array.isArray(values)) throw new Error("STARTUP_OS_STORAGE_ORIGINS must contain origins.");
  return [
    ...new Set(
      values.map((entry) => {
        // oxlint-disable-next-line deslop/no-runtime-typeof -- Public JSON config boundary: reject non-string entries before URL parsing.
        if (typeof entry !== "string" || !entry.trim()) throw new Error("Invalid storage origin.");
        const url = new URL(entry.trim());
        const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if (
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash ||
          /[\s;'"*]/.test(url.origin) ||
          (url.protocol !== "https:" && !(url.protocol === "http:" && loopback && !packaged))
        ) {
          throw new Error(
            "Storage origins must use HTTPS (loopback HTTP is allowed only in development).",
          );
        }
        return url.origin;
      }),
    ),
  ];
}

/**
 * @param {string[]} origins
 * @param {(request: Request, init: RequestInit) => Promise<Response>} fetchStorage
 */
export function storageRequest(origins, fetchStorage) {
  /** @param {Request} request */
  return async (request) => {
    const url = new URL(request.url);
    if (
      !origins.includes(url.origin) ||
      url.username ||
      url.password ||
      !["GET", "HEAD", "PUT", "OPTIONS"].includes(request.method)
    ) {
      return new Response("Forbidden", { status: 403 });
    }
    const headers = new Headers(request.headers);
    for (const name of ["cookie", "authorization", "proxy-authorization"]) headers.delete(name);
    // Signed URLs authorize storage access. Never use the app session or follow a
    // storage redirect to an origin that has not passed this allowlist.
    return fetchStorage(request, { headers, credentials: "omit", redirect: "error" });
  };
}
