import type { Fetch } from "./transport";
import { fetch } from "expo/fetch";

/** Expo's native request layer rejects redirects before a second request is sent. */
export const nativeFetch: Fetch = async (input, init) => {
  const response = await fetch(input, { ...init, redirect: "error" });
  const noBody = [204, 205, 304].includes(response.status);
  return new Response(noBody ? null : await response.arrayBuffer(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};
