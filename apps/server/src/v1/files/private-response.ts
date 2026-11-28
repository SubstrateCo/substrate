import type { Context } from "hono";

// Private files are per session. No shared cache may keep them or serve them to another cookie.
// With `keepSeconds`, the session's own browser may keep the response that long.
function privateHeaders(c: Context, keepSeconds?: number) {
  c.header(
    "Cache-Control",
    keepSeconds ? `private, max-age=${keepSeconds}, immutable` : "private, no-store",
  );
  c.header("Vary", "Cookie");
}

/**
 * Sends private file bytes. The browser must not guess another content type. Pass `keepSeconds`
 * only for a URL whose bytes never change.
 */
export function privateFileResponse(
  c: Context,
  bytes: Uint8Array,
  {
    disposition,
    type,
    keepSeconds,
  }: {
    disposition: string;
    type: "application/octet-stream" | "image/webp";
    keepSeconds?: number;
  },
) {
  privateHeaders(c, keepSeconds);
  c.header("Content-Disposition", disposition);
  c.header("Content-Type", type);
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(new Uint8Array(bytes));
}

/** Redirects to a signed storage URL for a private file. */
export function privateRedirect(c: Context, url: string) {
  privateHeaders(c);
  return c.redirect(url, 302);
}
