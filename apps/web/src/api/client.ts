import type { AppType } from "@startup-os/server/api";

import { hc } from "hono/client";

export const api = hc<AppType>("/", { init: { credentials: "same-origin" } }).api.v1;
export const desktopApi = hc<AppType>("/", { init: { credentials: "same-origin" } }).desktop;

export type ApiInput<T> = { data: T; signal?: AbortSignal };
