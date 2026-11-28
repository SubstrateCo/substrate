import { workspaceContinuation } from "./continuation";
import type { AuthMode } from "./types";

const invitationPath = /^\/accept-invitation\/[a-zA-Z0-9_-]{1,200}$/;
// oxlint-disable-next-line eslint/no-control-regex -- Reject control characters at the untrusted URL boundary.
const controlCharacters = /[\u0000-\u001f]/;

// oxlint-disable-next-line deslop/prefer-literal-union -- This parser receives an untrusted pathname and rejects unknown values.
export function authModeForPath(path: string): AuthMode | null {
  switch (path) {
    case "/login":
      return "login";
    case "/verify-email":
      return "verify";
    case "/forgot-password":
      return "forgot";
    case "/reset-password":
      return "reset";
    default:
      return null;
  }
}

// oxlint-disable-next-line deslop/prefer-literal-union -- This validator must accept an untrusted string, not only already-valid destinations.
export function authDestination(value: string | undefined): string | undefined {
  if (!value || value.length > 1000) return undefined;
  if (value.includes("\\") || controlCharacters.test(value)) return undefined;
  if (value === "/organizations" || invitationPath.test(value)) return value;
  if (value === "/" || value.startsWith("/?")) return workspaceContinuation(value);
  return undefined;
}

export function authRouteFromUrl(value: string, trustedWebOrigin?: string): string | null {
  if (!value || value.length > 8192) return null;
  if (value.includes("\\") || controlCharacters.test(value)) return null;
  try {
    let url: URL;
    let path: string;
    if (value.startsWith("/") && !value.startsWith("//")) {
      url = new URL(value, "https://mobile.invalid");
      path = url.pathname;
    } else {
      url = new URL(value);
      if (url.username || url.password) return null;
      if (url.protocol === "substrate-mobile:") {
        path = `/${url.hostname}${url.pathname}`;
      } else if (
        trustedWebOrigin &&
        url.origin === new URL(trustedWebOrigin).origin &&
        ["https:", "http:"].includes(url.protocol)
      ) {
        path = url.pathname;
      } else {
        return null;
      }
    }
    if (!authModeForPath(path) && !invitationPath.test(path) && path !== "/organizations")
      return null;
    const params = new URLSearchParams();
    for (const key of ["token", "email", "invitationId", "error"]) {
      const field = url.searchParams.get(key);
      if (!field) continue;
      if (field.length > 2048 || controlCharacters.test(field)) return null;
      if (key === "invitationId" && !/^[a-zA-Z0-9_-]{1,200}$/.test(field)) return null;
      params.set(key, field);
    }
    const destination = authDestination(url.searchParams.get("destination") ?? undefined);
    if (destination) params.set("destination", destination);
    return `${path}${params.size ? `?${params}` : ""}`;
  } catch {
    return null;
  }
}
