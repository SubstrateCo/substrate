export type InstallerPlatform = "windows" | "mac";

export const installerPlatforms = ["windows", "mac"] as const satisfies InstallerPlatform[];

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

/**
 * Which installer the page offers first. The browser's own OS wins when it has an installer.
 * An unrecognised OS gets the first published installer. A recognised OS without one gets none,
 * so we never push a Mac user to the Windows installer.
 */
export function chooseInstallers(
  available: Record<InstallerPlatform, boolean>,
  detected: InstallerPlatform | undefined,
) {
  const published = installerPlatforms.filter((platform) => available[platform]);
  let primary: InstallerPlatform | undefined = published[0];
  if (detected) primary = available[detected] ? detected : undefined;
  return { primary, others: published.filter((platform) => platform !== primary) };
}
