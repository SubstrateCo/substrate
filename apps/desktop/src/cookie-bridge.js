import { parse } from "set-cookie-parser";
import { bundledApplicationURL } from "./navigation.js";

/**
 * @typedef {{ header: (url: string) => Promise<string>, store: (url: string, values: string[]) => Promise<string[]> }} CookieBridge
 * @typedef {{ get: (filter: { url: string }) => Promise<Array<{ name: string, value: string, path?: string }>>, set: (details: import("electron").CookiesSetDetails) => Promise<void> }} CookieJar
 */

/** @param {string} value */
function appURL(value) {
  const url = new URL(value);
  if (url.origin !== bundledApplicationURL || url.username || url.password) {
    throw new Error("Cookie access requires the isolated app origin.");
  }
  return url;
}

/** @param {CookieJar} jar @param {string} backend @returns {CookieBridge} */
export function cookieBridge(jar, backend) {
  const backendHost = new URL(backend).hostname.toLowerCase();
  return {
    async header(value) {
      const url = appURL(value);
      const cookies = await jar.get({ url: url.href });
      return cookies
        .sort((left, right) => (right.path?.length ?? 0) - (left.path?.length ?? 0))
        .map((cookie) => `${cookie.name}=${cookie.value}`)
        .join("; ");
    },
    async store(value, values) {
      const url = appURL(value);
      // Keep signed/encoded auth values byte-for-byte. The upstream is trusted,
      // but it must not expand cookie scope beyond its configured host.
      const accepted = [];
      for (const raw of values) {
        const parsed = parse([raw], { decodeValues: false, silent: true });
        if (parsed.length === 0) continue;
        const cookie = parsed[0];
        if (cookie.domain && cookie.domain.toLowerCase().replace(/^\./, "") !== backendHost)
          continue;
        const lastSlash = url.pathname.lastIndexOf("/");
        const defaultPath = lastSlash > 0 ? url.pathname.slice(0, lastSlash) : "/";
        const path = cookie.path?.startsWith("/") ? cookie.path : defaultPath;
        /** @type {import("electron").CookiesSetDetails["sameSite"]} */
        let sameSite = "unspecified";
        switch (cookie.sameSite?.toLowerCase()) {
          case "none":
            sameSite = "no_restriction";
            break;
          case "strict":
            sameSite = "strict";
            break;
          case "lax":
            sameSite = "lax";
            break;
        }
        /** @type {import("electron").CookiesSetDetails} */
        const details = {
          url: url.href,
          name: cookie.name,
          value: cookie.value,
          path,
          secure: Boolean(cookie.secure),
          httpOnly: Boolean(cookie.httpOnly),
          // No Domain: all accepted backend cookies become app-host-only cookies.
          sameSite,
        };
        if (cookie.maxAge !== undefined && Number.isFinite(cookie.maxAge)) {
          details.expirationDate = cookie.maxAge <= 0 ? 1 : Date.now() / 1000 + cookie.maxAge;
        } else if (cookie.expires && Number.isFinite(cookie.expires.getTime())) {
          details.expirationDate = cookie.expires.getTime() / 1000;
        }
        // Electron applies expiry/deletion and cookie prefix constraints natively.
        // Await each write so a redirect or session refresh sees the new cookie.
        await jar.set(details);
        accepted.push(raw);
      }
      return accepted;
    },
  };
}
