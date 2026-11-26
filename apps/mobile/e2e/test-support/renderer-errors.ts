import type { APIRequestContext, Response } from "@playwright/test";

export async function bundleFailure(response: Response, request: APIRequestContext) {
  let body = await response.text().catch(() => "");
  // Chromium can discard a script body after rejecting its JSON error MIME type.
  // Fetch that same local bundle once through HTTP, without changing the renderer response.
  if (!body.trim()) {
    try {
      const diagnostic = await request.get(response.url(), { timeout: 10_000, maxRedirects: 0 });
      body = await diagnostic.text();
    } catch (error) {
      body = `Response body unavailable: ${error instanceof Error ? error.message : "HTTP request failed"}`;
    }
  }
  const limit = 16_000;
  const suffix = body.length > limit ? "\n[Bundle response truncated at 16000 characters]" : "";
  return `Metro bundle HTTP ${response.status()}\n${body.slice(0, limit)}${suffix}`;
}
