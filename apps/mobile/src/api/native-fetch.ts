import type { Fetch } from "./transport";
import { fetch } from "expo/fetch";

/** Expo's native request layer rejects redirects before a second request is sent. */
export const nativeFetch: Fetch = async (input, init) => {
  const response = await fetch(input, { ...init, redirect: "error" });
  const noBody = [204, 205, 304].includes(response.status);
  // Normalize Expo's standards-based response to this runtime's Response type.
  // Product responses are bounded; no native file stream crosses a runtime type boundary.
  return new Response(noBody ? null : await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};
