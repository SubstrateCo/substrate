import { signup, verifyEmail } from "../../web/e2e/auth.js";
import { openEmailLink } from "../../web/e2e/mailpit.js";
import { requestBrowserSignIn } from "./auth.js";
import { test } from "./fixture.js";
import { expect, type Page } from "@playwright/test";

async function review(page: Page, name: string) {
  const controls = page.locator(
    'input:not([type="hidden"]):visible, button:visible, a[href]:visible, [role="combobox"]:visible',
  );
  for (const control of await controls.all()) {
    await control.scrollIntoViewIfNeeded();
    const geometry = await control.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const clipped: string[] = [];
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const box = parent.getBoundingClientRect();
        const left = box.left + parent.clientLeft;
        const top = box.top + parent.clientTop;
        if (
          (/auto|scroll|hidden|clip/.test(style.overflowX) &&
            (bounds.left < left - 1 || bounds.right > left + parent.clientWidth + 1)) ||
          (/auto|scroll|hidden|clip/.test(style.overflowY) &&
            (bounds.top < top - 1 || bounds.bottom > top + parent.clientHeight + 1))
        ) {
          clipped.push(`${parent.tagName}.${parent.className}`);
        }
      }
      const center = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      );
      return {
        label: element.getAttribute("aria-label") ?? (element.textContent || element.tagName),
        fits:
          bounds.left >= -1 &&
          bounds.right <= innerWidth + 1 &&
          bounds.top >= -1 &&
          bounds.bottom <= innerHeight + 1,
        clipped,
        reachable: center === element || (center !== null && element.contains(center)),
      };
    });
    expect.soft(geometry.fits, `${name}: ${geometry.label} fits the viewport`).toBe(true);
    expect
      .soft(geometry.clipped, `${name}: ${geometry.label} has no clipping ancestor`)
      .toEqual([]);
    expect.soft(geometry.reachable, `${name}: ${geometry.label} is not covered`).toBe(true);
  }
  expect
    .soft(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `${name}: no horizontal document overflow`,
    )
    .toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

for (const size of [
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
  { width: 320, height: 812 },
  { width: 320, height: 568 },
]) {
  test(`Electron auth and workspace onboarding fit ${size.width}x${size.height}`, async ({
    desktop,
  }) => {
    test.setTimeout(180_000);
    await desktop.app.evaluate(({ BrowserWindow }, dimensions) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(0, 0);
      window.setContentSize(dimensions.width, dimensions.height);
    }, size);
    const page = desktop.page;
    const browser = desktop.browser;
    await browser.setViewportSize(size);
    await expect
      .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual(size);
    await expect(
      page.getByRole("button", { name: "Sign in with browser", exact: true }),
    ).toBeVisible();
    await review(page, "native-sign-in");
    await requestBrowserSignIn(desktop.app, page, browser);
    await expect(browser.getByText("Welcome back", { exact: true })).toBeVisible();
    await review(browser, "browser-sign-in");

    await browser.getByRole("link", { name: "Create account", exact: true }).click();
    await expect(browser.getByText("Create your account", { exact: true })).toBeVisible();
    await review(browser, "signup");
    await signup(browser, desktop.owner);
    await review(browser, "verification");
    const previousIds = await desktop.mailpit.messageIds(desktop.owner.email);
    await browser.getByRole("button", { name: "Resend verification email", exact: true }).click();
    await expect(
      browser.getByText("Verification email requested. Check your inbox and spam folder.", {
        exact: true,
      }),
    ).toBeVisible();
    await review(browser, "verification-resent");
    await verifyEmail(browser, desktop.mailpit, desktop.owner.email, previousIds);

    await browser.getByRole("link", { name: "Forgot password?", exact: true }).click();
    await expect(browser.getByText("Reset your password", { exact: true })).toBeVisible();
    await review(browser, "forgot-password");
    await browser.getByLabel("Email", { exact: true }).fill(desktop.owner.email);
    await browser.getByRole("button", { name: "Send reset link", exact: true }).click();
    await expect(
      browser.getByText("Check your inbox for a password reset link.", { exact: true }),
    ).toBeVisible();
    await review(browser, "reset-requested");
    await openEmailLink(
      browser,
      await desktop.mailpit.link(
        desktop.owner.email,
        "Reset your Startup OS password",
        "/api/auth/reset-password/",
      ),
    );
    await expect(browser.getByText("Choose a new password", { exact: true })).toBeVisible();
    await review(browser, "reset-password");
    const password = `Recovered-${desktop.suffix}!`;
    await browser.getByLabel("New password", { exact: true }).fill(password);
    await browser.getByLabel("Confirm password", { exact: true }).fill(password);
    await browser.getByRole("button", { name: "Save new password", exact: true }).click();
    await expect(
      browser.getByText("Your password was changed. You can now sign in.", { exact: true }),
    ).toBeVisible();
    await review(browser, "reset-complete");

    await requestBrowserSignIn(desktop.app, page, browser);
    await browser.getByLabel("Email", { exact: true }).fill(desktop.owner.email);
    await browser.getByLabel("Password", { exact: true }).fill(desktop.owner.password);
    await browser.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(browser.getByRole("alert")).toContainText(/invalid|incorrect/i);
    await review(browser, "sign-in-error");
    desktop.owner.password = password;
    await desktop.login(desktop.owner);
    await review(browser, "return-to-desktop");
    await expect(page.getByRole("heading", { name: "Your workspaces", exact: true })).toBeVisible();
    await review(page, "empty-workspaces");

    for (const [index, name] of [desktop.workspace, `Second ${desktop.workspace}`].entries()) {
      await page.getByLabel("Workspace name", { exact: true }).fill(name);
      await page
        .getByLabel("Workspace slug", { exact: true })
        .fill(`auth-${index}-${desktop.suffix}`);
      await review(page, `create-workspace-${index}`);
      await page.getByRole("button", { name: "Create workspace", exact: true }).click();
      await expect(page.getByRole("button", { name: `${name} ▾`, exact: true })).toBeVisible();
      await desktop.openPath("/organizations");
      await expect(
        page.getByRole("heading", { name: "Your workspaces", exact: true }),
      ).toBeVisible();
    }
    await review(page, "workspace-selection");
    await page.getByRole("button", { name: desktop.workspace, exact: true }).click();
    await expect(
      page.getByRole("button", { name: `${desktop.workspace} ▾`, exact: true }),
    ).toBeVisible();
  });
}
