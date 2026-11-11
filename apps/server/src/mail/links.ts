import { desktopOrigin } from "@substrate/contracts/desktop/links";

import { desktopHandoffURL } from "../desktop/service";

type LinkOptions = { baseURL: string; request?: Request };

function isDesktop(frontendURL: string, options: LinkOptions) {
  return frontendURL === desktopOrigin || options.request?.headers.get("origin") === desktopOrigin;
}

export function frontendAuthLink(value: string, frontendURL: string) {
  const source = new URL(value);
  const origin = frontendURL;
  const url = new URL(`${source.pathname}${source.search}${source.hash}`, origin);
  const callback = url.searchParams.get("callbackURL");
  if (callback) url.searchParams.set("callbackURL", new URL(callback, origin).toString());
  return url.toString();
}

export function invitationLink(id: string, frontendURL: string, options: LinkOptions) {
  const path = `/accept-invitation/${encodeURIComponent(id)}`;
  return isDesktop(frontendURL, options)
    ? desktopHandoffURL(path, options.baseURL)
    : new URL(path, frontendURL).toString();
}
