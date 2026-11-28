import { serverOrigin } from "./origin";

export function mobileApiURL(
  value: string,
  baseURL = serverOrigin(process.env.EXPO_PUBLIC_API_URL),
) {
  const base = new URL(baseURL);
  const url = new URL(value, base);
  if (url.origin !== base.origin || url.username || url.password)
    throw new Error("This is not a file URL on the configured API server.");
  if (url.pathname.startsWith("/api/v1/"))
    url.pathname = url.pathname.replace("/api/v1/", "/api/mobile/");
  if (!url.pathname.startsWith("/api/mobile/"))
    throw new Error("This is not a mobile product API URL.");
  return url.toString();
}
