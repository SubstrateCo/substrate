const exactHosts = new Set([
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "teams.live.com",
  "whereby.com",
  "around.co",
  "app.slack.com",
]);
const hostSuffixes = [".zoom.us", ".webex.com"];

/**
 * The normalized URL when Join may open it in the system browser, or null. Only HTTPS links on
 * known meeting hosts pass, without credentials or a custom port. The URL parser lowercases
 * hosts and converts IDNs to punycode, so look-alikes cannot match by Unicode tricks.
 */
export function joinableConferenceURL(value: string | null | undefined) {
  if (!value || value.length > 2048) return null;
  const url = URL.parse(value);
  if (url?.protocol !== "https:") return null;
  const hasCredentials = Boolean(url.username || url.password);
  if (hasCredentials || url.port) return null;
  const host = url.hostname;
  if (host.split(".").some((label) => label.startsWith("xn--"))) return null;
  const known = exactHosts.has(host) || hostSuffixes.some((suffix) => host.endsWith(suffix));
  if (!known) return null;
  if (host === "app.slack.com" && !url.pathname.startsWith("/huddle/")) return null;
  return url.href;
}
