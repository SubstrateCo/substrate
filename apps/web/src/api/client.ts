import type { AppType } from "@substrate/server/api";

import { hc } from "hono/client";

export const createApi = (fetch: typeof globalThis.fetch = globalThis.fetch) =>
  hc<AppType>("/", { fetch, init: { credentials: "same-origin" } });

const client = createApi();
export const api = client.api.v1;
export const desktopApi = client.desktop;
export type Api = typeof api;
