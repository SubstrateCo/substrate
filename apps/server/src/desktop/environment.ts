import { explicitOrigin } from "../auth/environment";

export function desktopEnvironment(env: Record<string, string | undefined> = process.env) {
  const frontendURL = explicitOrigin(env.APP_URL ?? "http://localhost:3000");
  const windowsURL = env.STARTUP_OS_WINDOWS_DOWNLOAD_URL || undefined;
  if (windowsURL) {
    const url = new URL(windowsURL);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("STARTUP_OS_WINDOWS_DOWNLOAD_URL must be an HTTPS URL without credentials.");
  }
  return { frontendURL, windowsURL };
}
