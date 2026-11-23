import { isPublicRoutableHost } from "@better-auth/core/utils/host";
import { decodeHTMLAttribute } from "entities";
import { lookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { get } from "node:https";
import { isIP } from "node:net";

const maxBytes = 4 * 1024 * 1024;
const accept = "image/png,image/jpeg,image/webp,image/gif,image/avif";

export function pictureURL(raw: string) {
  const url = URL.parse(raw.startsWith("//") ? `https:${raw}` : raw);
  if (!url || !["https:", "http:"].includes(url.protocol) || url.port) return null;
  if (url.username || url.password || !isPublicRoutableHost(url.hostname)) return null;
  if (isIP(url.hostname) || !url.hostname.includes(".") || url.hostname.includes(":")) return null;
  url.protocol = "https:";
  url.hash = "";
  return url;
}

/** Match complete src/background attributes and CSS url() references, including HTML-escaped
 * query strings. A substring of a link or a renderer-supplied destination is not sufficient. */
export function referencedPicture(html: string, source: string) {
  const url = pictureURL(source);
  if (!url) return null;
  const refs = decodeHTMLAttribute(html).matchAll(
    /(?:\b(?:src|background)\s*=\s*|\burl\(\s*)(?:"([^"]+)"|'([^']+)'|([^\s'"<>)]+))/gi,
  );
  for (const match of refs) {
    const value = match.slice(1).find(Boolean);
    if (value && pictureURL(value.trim())?.href === url.href) return url;
  }
  return null;
}

function raster(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  const prefix = bytes.toString("ascii", 0, 12);
  if (prefix.startsWith("GIF87a") || prefix.startsWith("GIF89a")) return "image/gif";
  if (prefix.startsWith("RIFF") && prefix.endsWith("WEBP")) return "image/webp";
  if (["ftypavif", "ftypavis"].includes(prefix.slice(4))) return "image/avif";
  return null;
}

export async function readMailPicture(initial: URL, parent: AbortSignal): Promise<string | null> {
  const signal = AbortSignal.any([parent, AbortSignal.timeout(12_000)]);
  let url = initial;
  for (let hop = 0; hop <= 3; hop++) {
    signal.throwIfAborted();
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((a) => !isPublicRoutableHost(a.address))) return null;
    const address = addresses.find((a) => a.family === 4) ?? addresses[0]!;
    // Connect to the checked address itself (no second DNS lookup). TLS verifies the original
    // hostname, and each redirect goes through the same checks. No app cookies or referrer.
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      get(
        {
          hostname: address.address,
          servername: url.hostname,
          path: url.pathname + url.search,
          headers: { host: url.host, accept },
          agent: false,
          signal,
        },
        resolve,
      ).once("error", reject);
    });
    try {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        const location = response.headers.location;
        const next = location && URL.parse(location, url);
        const checked = next && pictureURL(next.href);
        if (!checked) return null;
        url = checked;
        continue;
      }
      if (response.statusCode !== 200 || Number(response.headers["content-length"]) > maxBytes)
        return null;
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of response) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > maxBytes) return null;
        chunks.push(bytes);
      }
      const data = Buffer.concat(chunks, size),
        mime = raster(data);
      return mime ? `data:${mime};base64,${data.toString("base64")}` : null;
    } finally {
      response.destroy();
    }
  }
  return null;
}
