import type { Context } from "hono";

function privateHeaders(c: Context, keepSeconds?: number) {
  c.header(
    "Cache-Control",
    keepSeconds ? `private, max-age=${keepSeconds}, immutable` : "private, no-store",
  );
  c.header("Vary", "Cookie");
}

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

export function privateRedirect(c: Context, url: string) {
  privateHeaders(c);
  return c.redirect(url, 302);
}
