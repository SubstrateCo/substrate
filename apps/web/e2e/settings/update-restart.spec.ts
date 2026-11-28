import type { DesktopUpdateStatus } from "@substrate/contracts/desktop/updates-ipc";

import { test, visit } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("restart feedback blocks repeat actions during shutdown and recovers from failure", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await user.page.addInitScript(() => {
    let status: DesktopUpdateStatus = {
      appVersion: "0.1.0",
      install: "automatic",
      state: { status: "ready", version: "0.2.0" },
    };
    const listeners = new Set<(value: DesktopUpdateStatus) => void>();
    let installs = 0;
    Object.defineProperty(window, "substrateUpdates", {
      value: {
        get: async () => status,
        onChange: (listener: (value: DesktopUpdateStatus) => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        checkForUpdates: async () => status,
        openDownloadPage: async () => {},
        installNow: async () => {
          document.documentElement.dataset.updateInstalls = String(++installs);
          status = { ...status, state: { status: "installing", version: "0.2.0" } };
          for (const listener of listeners) listener(status);
          await new Promise<void>((resolve) => {
            window.addEventListener(
              "test-install-failed",
              () => {
                status = { ...status, state: { status: "error" } };
                for (const listener of listeners) listener(status);
                resolve();
              },
              { once: true },
            );
          });
        },
      },
    });
  });
  await visit(user, undefined, "/settings/user");
  await user.page.getByLabel("Full name", { exact: true }).fill("Unsaved name");
  await user.page.getByRole("button", { name: "Restart to update", exact: true }).click();
  const discard = user.page.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(discard).toBeVisible();
  await discard.getByRole("button", { name: "Keep editing" }).click();
  await expect(user.page.locator("html")).not.toHaveAttribute("data-update-installs");
  await expect(user.page.getByLabel("Full name", { exact: true })).toHaveValue("Unsaved name");
  await user.page.getByRole("button", { name: "Discard", exact: true }).click();
  await visit(user, undefined, "/settings/user/preferences");
  const updates = user.page.getByRole("region", { name: "Updates", exact: true });
  await updates.getByRole("button", { name: "Restart to update" }).click();
  const dialog = user.page.getByRole("dialog", { name: "Restarting to update" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toContainText("Stopping agents");
  await expect(dialog).toContainText("Substrate will close and reopen with version 0.2.0");
  await user.page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(0);
  await expect(user.page.locator("html")).toHaveAttribute("data-update-installs", "1");
  await user.page.evaluate(() => window.dispatchEvent(new Event("test-install-failed")));
  await expect(dialog).toHaveCount(0);
  await expect(updates).toContainText("Couldn’t finish the update");
  await expect(updates.getByRole("button", { name: "Check for updates" })).toBeEnabled();
});
