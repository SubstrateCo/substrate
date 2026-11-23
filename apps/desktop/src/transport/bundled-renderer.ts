import { bundledApplicationURL } from "../shell/navigation.ts";
import { storageOrigins } from "./storage.ts";
import { realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export function backendURL(value: string | undefined, packaged: boolean) {
  if (!value && packaged) throw new Error("Packaged Substrate requires SUBSTRATE_API_URL.");
  const url = new URL(value || "http://localhost:3001");
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const hasCredentials = url.username || url.password;
  const hasPathQueryOrFragment = url.pathname !== "/" || url.search || url.hash;
  const isAllowedProtocol = url.protocol === "https:" || (url.protocol === "http:" && loopback);
  if (hasCredentials || hasPathQueryOrFragment || !isAllowedProtocol) {
    throw new Error(
      "SUBSTRATE_API_URL must be an HTTPS origin (HTTP is allowed only on loopback).",
    );
  }
  return url.origin;
}

function isAppURL(url: URL, origin: string = bundledApplicationURL) {
  return url.origin === origin && !url.username && !url.password;
}

/** `backend` is a validated `backendURL()` origin. */
export function proxyURL(value: string, backend: string, origin: string = bundledApplicationURL) {
  const url = new URL(value);
  if (!isAppURL(url, origin) || !(url.pathname === "/api" || url.pathname.startsWith("/api/"))) {
    throw new Error("Only app API requests can be proxied.");
  }
  const path = decodeURIComponent(url.pathname);
  if (path.includes("\\") || path.split("/").some((part) => part === ".." || part.includes("\0"))) {
    throw new Error("Unsafe API path.");
  }
  // Concatenation keeps even a double-slash pathname on the configured origin.
  return new URL(`${backend}${url.pathname}${url.search}`).href;
}

function confined(root: string, file: string) {
  const path = relative(root, file);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function assetPath(root: string, url: URL) {
  if (!isAppURL(url)) return null;
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  const segments = pathname.split("/");
  if (segments.some((part) => part === ".." || /[\\:\0]/.test(part))) return null;
  const directory = await realpath(root);
  const candidate = resolve(directory, `.${pathname}`);
  if (!confined(directory, candidate)) return null;
  async function existingFile(path: string) {
    try {
      const actual = await realpath(path);
      return confined(directory, actual) && (await stat(actual)).isFile() ? actual : null;
    } catch {
      return null;
    }
  }
  const file = await existingFile(candidate);
  if (file) return file;
  // Missing assets must not receive HTML; extensionless workspace routes use SPA history.
  return extname(pathname) ? null : existingFile(resolve(directory, "index.html"));
}

const hopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function forwardingHeaders(source: Headers) {
  const headers = new Headers(source);
  for (const name of (headers.get("connection") || "").split(",")) {
    if (name.trim()) headers.delete(name.trim());
  }
  for (const name of hopHeaders) headers.delete(name);
  return headers;
}

export function bundledRenderer({
  directory,
  backend,
  fetchFile,
  fetchUpstream = fetch,
  origin = bundledApplicationURL,
  storageOrigins: configuredStorageOrigins = [],
}: {
  directory: string;
  backend: string;
  fetchFile: (url: string) => Promise<Response>;
  fetchUpstream?: (url: string, init: RequestInit) => Promise<Response>;
  origin?: string;
  storageOrigins?: string[];
}) {
  const upstream = backendURL(backend, false);
  const storageSources = storageOrigins(configuredStorageOrigins, false)
    .map((value) => ` ${value}`)
    .join("");
  return async (request: Request) => {
    const url = new URL(request.url);
    if (!isAppURL(url, origin)) return new Response("Forbidden", { status: 403 });
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      try {
        const headers = forwardingHeaders(request.headers);
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
          const requestOrigin = headers.get("origin");
          if (requestOrigin && requestOrigin !== origin)
            return new Response("Forbidden", { status: 403 });
          // This handler belongs to the isolated app session. Electron can intercept
          // same-origin requests before Chromium adds Origin; keep server CSRF checks enabled.
          headers.set("origin", origin);
        }
        headers.delete("host");
        headers.delete("content-length");
        headers.delete("accept-encoding");
        const response = await fetchUpstream(proxyURL(request.url, upstream, origin), {
          method: request.method,
          headers,
          body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
          redirect: "manual",
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
        });
        const resultHeaders = forwardingHeaders(response.headers);
        const responseCookies = response.headers.getSetCookie();
        // Node fetch decompresses upstream bodies. Do not retain wire encoding/length.
        resultHeaders.delete("content-encoding");
        resultHeaders.delete("content-length");
        resultHeaders.delete("set-cookie");
        for (const cookie of responseCookies) resultHeaders.append("set-cookie", cookie);
        return new Response(request.method === "HEAD" ? null : response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: resultHeaders,
        });
      } catch {
        return new Response("API unavailable", { status: 502 });
      }
    }
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    try {
      const file = await assetPath(directory, url);
      if (!file) return new Response("Not found", { status: 404 });
      const response = await fetchFile(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Cache-Control", "no-cache");
      headers.set(
        "Content-Security-Policy",
        url.pathname === "/mail-body.html"
          ? "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox allow-same-origin"
          : `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:${storageSources}; connect-src 'self'${storageSources}; frame-src ${origin}/mail-body.html; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'`,
      );
      return new Response(request.method === "HEAD" ? null : response.body, {
        status: response.status,
        headers,
      });
    } catch {
      return new Response("Bundled renderer unavailable", { status: 503 });
    }
  };
}
