export const applicationURL = "http://localhost:3000";

/** @param {string} value */
export function navigationTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return "blocked";
  }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) {
    return "blocked";
  }
  return url.origin === applicationURL ? "internal" : "external";
}
