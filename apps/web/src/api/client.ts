import type { AppType } from "@startup-os/server/api";

import { hc } from "hono/client";

const client = hc<AppType>("/", { init: { credentials: "same-origin" } });
export const api = client.api.v1;
export const desktopApi = client.desktop;

export type ApiInput<T> = { data: T; signal?: AbortSignal };
