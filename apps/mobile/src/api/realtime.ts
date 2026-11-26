import { Platform } from "react-native";

import { authClient } from "./auth-client";
import { apiURL, mobileOrigin } from "./config";
import { createAuthenticatedRealtime } from "./realtime-transport";

// React Native extends the platform constructor with request headers. Keep that
// native signature local: the web path never passes these credentials.
const NativeWebSocket: new (
  url: string,
  protocols?: string[],
  options?: { headers?: Record<string, string> },
) => WebSocket = globalThis.WebSocket;

export function createMobileRealtime() {
  return createAuthenticatedRealtime({
    baseURL: apiURL,
    native: Platform.OS !== "web",
    origin: mobileOrigin,
    getCookie: () => authClient.getCookie(),
    createSocket: (url, headers) =>
      Platform.OS === "web" ? new WebSocket(url) : new NativeWebSocket(url, undefined, { headers }),
  });
}
