import { serverOrigin } from "../origin";
import { mobileApiURL } from "../urls";

export function pictureBytesURL(
  value: string,
  baseURL = serverOrigin(process.env.EXPO_PUBLIC_API_URL),
) {
  const url = new URL(mobileApiURL(value, baseURL));
  const picture =
    /^\/api\/mobile\/files\/pictures\/(?:avatar|organization-logo|project-icon)\/[^/]+(?:\/bytes)?$/;
  const legacy = /^\/api\/mobile\/files\/[0-9a-f-]{36}\/(?:content|bytes)$/;
  if (picture.test(url.pathname)) {
    if (!url.pathname.endsWith("/bytes")) url.pathname += "/bytes";
  } else if (legacy.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/content$/, "/bytes");
  } else {
    throw new Error("This is not a managed picture URL.");
  }
  return url.toString();
}

export function privateImageURL(
  value: string,
  baseURL = serverOrigin(process.env.EXPO_PUBLIC_API_URL),
) {
  const url = new URL(mobileApiURL(value, baseURL));
  if (url.pathname === "/api/mobile/files/attachments/messages/preview") return url.toString();
  return pictureBytesURL(value, baseURL);
}

export function attachmentDownloadURL(
  value: string,
  baseURL = serverOrigin(process.env.EXPO_PUBLIC_API_URL),
) {
  const url = new URL(mobileApiURL(value, baseURL));
  if (!/^\/api\/mobile\/files\/attachments\/(?:messages|tasks)\/content$/.test(url.pathname))
    throw new Error("Use an authenticated attachment download URL.");
  return url.toString();
}
