import { bundledRenderer } from "./bundled-renderer.ts";
import { storageRequest } from "./storage.ts";
import { net, type Session } from "electron";

/** Renderer responses (including CSP) and storage use distinct transports. */
export function configureProtocols(options: {
  desktopSession: Session;
  bundled: boolean;
  rendererURL: string;
  directory: string;
  backend: string;
  allowedStorageOrigins: string[];
  fetchAPI: (url: string, init: RequestInit) => Promise<Response>;
}) {
  const { desktopSession, rendererURL, allowedStorageOrigins } = options;
  const fetchStorage = storageRequest(allowedStorageOrigins, (request, init) =>
    desktopSession.fetch(request, { ...init, bypassCustomProtocolHandlers: true }),
  );
  const serveRenderer = bundledRenderer({
    directory: options.directory,
    backend: options.backend,
    fetchUpstream: options.fetchAPI,
    fetchFile: (url) => net.fetch(url),
    ...(options.bundled ? { storageOrigins: allowedStorageOrigins } : { origin: rendererURL }),
  });
  if (options.bundled) {
    for (const scheme of ["https", "http"])
      desktopSession.protocol.handle(scheme, (request) =>
        new URL(request.url).origin === rendererURL
          ? serveRenderer(request)
          : fetchStorage(request),
      );
    return;
  }
  const serveDevelopment = (request: Request) => {
    const url = new URL(request.url);
    if (url.origin === rendererURL && (url.pathname === "/api" || url.pathname.startsWith("/api/")))
      return serveRenderer(request);
    if (allowedStorageOrigins.includes(url.origin)) return fetchStorage(request);
    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  };
  for (const scheme of new Set([
    new URL(rendererURL).protocol.slice(0, -1),
    ...allowedStorageOrigins.map((value) => new URL(value).protocol.slice(0, -1)),
  ]))
    desktopSession.protocol.handle(scheme, serveDevelopment);
}
