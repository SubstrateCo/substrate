import { hc } from "hono/client";
import type { AppType } from "@startup-os/server/api";

export const api = hc<AppType>("/", { init: { credentials: "same-origin" } }).api.v1;

export type ApiInput<T> = { data: T; signal?: AbortSignal };
