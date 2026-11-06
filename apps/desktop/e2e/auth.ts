import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { desktopScheme } from "@startup-os/contracts/desktop/links";

export async function requestBrowserSignIn(
  desktop: ElectronApplication,
  renderer: Page,
  browser: Page,
) {
  await desktop.evaluate(({ shell }) => {
    delete process.env.STARTUP_OS_TEST_AUTH_URL;
    // Only replace the OS browser opener. PKCE, HTTP, IPC, and token exchange stay real.
    shell.openExternal = async (url) => {
      process.env.STARTUP_OS_TEST_AUTH_URL = url;
    };
  });
  await renderer.getByRole("button", { name: "Sign in with browser", exact: true }).click();
  await expect
    .poll(() => desktop.evaluate(() => process.env.STARTUP_OS_TEST_AUTH_URL))
    .toBeTruthy();
  const url = await desktop.evaluate(() => process.env.STARTUP_OS_TEST_AUTH_URL!);
  await browser.goto(url);
}

export async function authorizationCallback(browser: Page, action: () => Promise<void>) {
  const response = browser.waitForResponse(
    (response) =>
      ["/api/auth/sign-in/email", "/api/auth/electron/transfer-user"].includes(
        new URL(response.url()).pathname,
      ) && response.request().method() === "POST",
  );
  await action();
  const result = await response;
  expect(result.ok(), "Browser authorization succeeds").toBe(true);
  const cookies = (await result.headersArray()).filter(
    (header) => header.name.toLowerCase() === "set-cookie",
  );
  const token = cookies
    .map((header) => /(?:^|\s)better-auth\.electron=([^;]+)/.exec(header.value)?.[1])
    .find(Boolean);
  if (!token) throw new Error("Browser authorization did not produce a desktop callback.");
  await expect(browser.getByText("Return to Startup OS", { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      (await browser.context().cookies()).some((cookie) => cookie.name === "better-auth.electron"),
    )
    .toBe(false);
  return `${desktopScheme}://auth/callback#token=${token}`;
}
