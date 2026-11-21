import type { AppType } from "@substrate/server/api";

import { hc } from "hono/client";

// Hono's $url helper needs an absolute base; native downloads use the session's cookies.
export function downloadApi() {
  return hc<AppType>(window.location.origin).api.v1;
}
