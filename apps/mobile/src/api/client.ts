import type { AppType } from "@substrate/server/api";

import { onlineManager } from "@tanstack/react-query";

import { Platform } from "react-native";

import { authClient } from "./auth-client";
import { apiURL, mobileOrigin } from "./config";
import { nativeFetch } from "./native-fetch";
import { createAuthenticatedFetch } from "./transport";
import { hc } from "hono/client";

const unauthorized = new Set<() => void>();
export function onUnauthorized(callback: () => void) {
  unauthorized.add(callback);
  return () => {
    unauthorized.delete(callback);
  };
}

export const authenticatedFetch = createAuthenticatedFetch({
  baseURL: apiURL,
  native: Platform.OS !== "web",
  origin: mobileOrigin,
  getCookie: () => authClient.getCookie(),
  isOnline: () => onlineManager.isOnline(),
  fetch: Platform.OS === "web" ? globalThis.fetch : nativeFetch,
  onUnauthorized: () => {
    for (const callback of unauthorized) callback();
  },
});

export const createApi = (fetch: typeof globalThis.fetch = authenticatedFetch) =>
  hc<AppType>(apiURL, { fetch });
export const api = createApi().api.mobile;
export type Api = typeof api;
