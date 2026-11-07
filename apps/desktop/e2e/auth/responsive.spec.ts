import { requestBrowserSignIn } from "../test-support/auth.js";
import { test } from "../test-support/fixture.js";
import { fitsWindow, resize } from "../test-support/layout.js";
import { expect } from "@playwright/test";

for (const size of [
  { width: 1024, height: 768 },
  { width: 320, height: 568 },
]) {
  test(
    `auth controls and workspace forms fit ${size.width}x${size.height}`,
    { tag: "@layout" },
    async ({ desktop }) => {
      await resize(desktop, size.width, size.height);
      const { page, browser } = desktop;
      await fitsWindow(page.getByRole("button", { name: "Sign in with browser", exact: true }));
      const card = (await page.getByRole("main").locator('[data-slot="card"]').boundingBox())!;
      const bar = (await page.getByRole("banner", { name: "Window title bar" }).boundingBox())!;
      expect(
        Math.abs(card.y + card.height / 2 - (size.height + bar.height) / 2),
      ).toBeLessThanOrEqual(1);
      await requestBrowserSignIn(desktop.app, page, browser);
      const browserOrigin = new URL(browser.url()).origin;
      await browser.setViewportSize(size);
      for (const path of [
        "/login",
        "/signup",
        "/verify-email?email=layout%40example.test",
        "/forgot-password",
        "/reset-password?token=layout-only",
      ]) {
        await browser.goto(new URL(path, browserOrigin).href);
        await expect(browser.getByRole("main")).toBeVisible();
        const controls = browser.locator("input:visible, button:visible, a[href]:visible");
        expect(await controls.count()).toBeGreaterThan(0);
        for (const control of await controls.all()) await fitsWindow(control);
      }
      await desktop.provision();
      await desktop.openPath("/organizations");
      await fitsWindow(page.getByRole("button", { name: desktop.workspace, exact: true }));
      await page.getByLabel("Workspace name", { exact: true }).fill("Workspace".repeat(15));
      for (const label of ["Workspace name", "Workspace slug"])
        await fitsWindow(page.getByLabel(label, { exact: true }));
      await fitsWindow(page.getByRole("button", { name: "Create workspace", exact: true }));
    },
  );
}
