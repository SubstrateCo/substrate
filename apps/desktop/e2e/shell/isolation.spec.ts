import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("desktop windows keep menus and appearance isolated", async ({ desktop, desktopPeer }) => {
  await desktopPeer.page.getByRole("button", { name: "Color theme", exact: true }).click();
  await desktopPeer.page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await desktop.page.getByRole("button", { name: "Color theme", exact: true }).click();
  const dark = desktop.page.getByRole("menuitemradio", { name: "Dark", exact: true });
  await expect(dark).toBeVisible();
  await desktop.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.blur();
  });
  await desktopPeer.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.focus();
  });
  await expect(dark).toBeVisible();
  await dark.click();
  await expect(desktop.page.locator("html")).toHaveClass(/dark/);
  await expect(desktopPeer.page.locator("html")).not.toHaveClass(/dark/);
});
