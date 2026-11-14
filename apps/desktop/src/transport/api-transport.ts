import { desktopInstallationHeader, desktopOrigin } from "@substrate/contracts/desktop/links";

/** Remove session credentials, at any depth, before returning auth responses to the renderer. */
function publicAuthJSON(body: string) {
  return JSON.stringify(JSON.parse(body, (key, item) => (key === "token" ? undefined : item)));
}

type AuthFetchOptions = {
  method?: string;
  headers: Record<string, string>;
  body?: string;
  redirect: "manual";
  signal?: AbortSignal | null;
  onResponse: (context: { response: Response }) => Promise<void>;
};

export function desktopAPITransport({
  getCookie,
  authFetch,
  fetchUpstream = fetch,
  installationId,
}: {
  getCookie: () => string;
  /** The transport reads the response in onResponse, not the client's parsed result. */
  authFetch: (path: string, options: AuthFetchOptions) => Promise<object | void>;
  fetchUpstream?: (url: string, init: RequestInit) => Promise<Response>;
  installationId?: string;
}) {
  return async (value: string, init: RequestInit) => {
    const url = new URL(value);
    const headers = new Headers(init.headers);
    headers.delete("cookie");
    headers.delete("authorization");
    headers.delete(desktopInstallationHeader);
    headers.set("origin", desktopOrigin);
    // Main names its installation; the renderer cannot choose another device.
    if (installationId) headers.set(desktopInstallationHeader, installationId);
    if (url.pathname.startsWith("/api/auth/")) {
      const path = url.pathname.slice("/api/auth".length);
      const profileUpdate = path === "/update-user" && init.method === "POST";
      if (path !== "/get-session" && !path.startsWith("/organization/") && !profileUpdate) {
        return new Response("Use the desktop auth bridge.", { status: 403 });
      }
      let result = new Response("Auth unavailable", { status: 502 });
      await authFetch(`${path}${url.search}`, {
        method: init.method,
        headers: Object.fromEntries(headers),
        body: init.body ? await new Response(init.body).text() : undefined,
        redirect: "manual",
        signal: init.signal,
        onResponse: async ({ response }) => {
          const responseHeaders = new Headers(response.headers);
          responseHeaders.delete("set-cookie");
          responseHeaders.delete("content-length");
          responseHeaders.delete("content-encoding");
          const body = await response.clone().text();
          result = new Response(
            body && responseHeaders.get("content-type")?.includes("application/json")
              ? publicAuthJSON(body)
              : body || null,
            {
              status: response.status,
              headers: responseHeaders,
            },
          );
        },
      });
      return result;
    }
    headers.set("cookie", getCookie());
    const response = await fetchUpstream(value, { ...init, headers });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("set-cookie");
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  };
}
