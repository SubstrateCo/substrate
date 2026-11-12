import { desktopOrigin } from "@substrate/contracts/desktop/links";

export const applicationURL = new URL(process.env.SUBSTRATE_WEB_URL ?? "http://localhost:3000")
  .origin;
export const bundledApplicationURL = desktopOrigin;

export function navigationTarget(value: string, appURL = applicationURL) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "blocked";
  }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) {
    return "blocked";
  }
  return url.origin === appURL ? "internal" : "external";
}
