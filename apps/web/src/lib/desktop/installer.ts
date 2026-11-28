export type InstallerPlatform = "windows" | "mac";

const installerPlatforms = ["windows", "mac"] as const satisfies InstallerPlatform[];

export const installerPlatformNames: Record<InstallerPlatform, string> = {
  windows: "Windows",
  mac: "macOS",
};

/**
 * The desktop OS of the browser, from the user agent string. Every major browser keeps the OS
 * token there. iPadOS reports itself as a Mac, so a touch screen rules a Mac out.
 */
export function browserInstallerPlatform(
  browser: Pick<Navigator, "userAgent" | "maxTouchPoints">,
): InstallerPlatform | undefined {
  if (/Windows NT/i.test(browser.userAgent)) return "windows";
  if (/Macintosh/i.test(browser.userAgent) && browser.maxTouchPoints <= 1) return "mac";
  return undefined;
}

export function chooseInstallers(
  available: Record<InstallerPlatform, boolean>,
  detected: InstallerPlatform | undefined,
) {
  const published = installerPlatforms.filter((platform) => available[platform]);
  let primary: InstallerPlatform | undefined = published[0];
  if (detected) primary = available[detected] ? detected : undefined;
  return { primary, others: published.filter((platform) => platform !== primary) };
}

export type InstallMode =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "download"; platform: InstallerPlatform }
  | { kind: "browser" };

export function installMode(
  release: "loading" | "unavailable" | "error" | "stale" | "ready",
  primary: InstallerPlatform | undefined,
): InstallMode {
  if (release === "loading") return { kind: "loading" };
  if (release === "error" || release === "unavailable") return { kind: "error" };
  return primary ? { kind: "download", platform: primary } : { kind: "browser" };
}
