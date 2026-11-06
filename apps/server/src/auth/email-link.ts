import { desktopOrigin, desktopPath } from "@startup-os/contracts/desktop/links";

type LinkOptions = { baseURL: string; request?: Request };

function isDesktop(frontendURL: string, options?: LinkOptions, callback?: string | null) {
  if (frontendURL === desktopOrigin || options?.request?.headers.get("origin") === desktopOrigin)
    return true;
  if (!callback) return false;
  try {
    return new URL(callback, frontendURL).origin === desktopOrigin;
  } catch {
    return false;
  }
}

function desktopLanding(path: string, baseURL: string) {
  const url = new URL("/desktop/open", baseURL);
  url.searchParams.set("path", desktopPath.parse(path));
  return url.toString();
}

export function frontendAuthLink(value: string, frontendURL: string, options?: LinkOptions) {
  const source = new URL(value);
  const desktop =
    options && isDesktop(frontendURL, options, source.searchParams.get("callbackURL"));
  const origin = desktop ? desktopOrigin : frontendURL;
  const url = new URL(`${source.pathname}${source.search}${source.hash}`, origin);
  const callback = url.searchParams.get("callbackURL");
  if (callback) url.searchParams.set("callbackURL", new URL(callback, origin).toString());
  if (desktop) return desktopLanding(`${url.pathname}${url.search}${url.hash}`, options.baseURL);
  return url.toString();
}

export function invitationLink(id: string, frontendURL: string, options: LinkOptions) {
  const path = `/accept-invitation/${encodeURIComponent(id)}`;
  return isDesktop(frontendURL, options)
    ? desktopLanding(path, options.baseURL)
    : new URL(path, frontendURL).toString();
}
