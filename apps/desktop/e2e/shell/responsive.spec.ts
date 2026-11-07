import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { fitsWindow, resize } from "../test-support/layout.js";
import { expect } from "@playwright/test";

for (const size of [
  { width: 1024, height: 768 },
  { width: 320, height: 568 },
]) {
  test(
    `search, user menu and notifications fit ${size.width}x${size.height}`,
    { tag: "@layout" },
    async ({ desktop }) => {
      await desktop.provision();
      const { page } = desktop;
      const title = `responsive-${"longchannelname".repeat(4)}`;
      const created = await callMessaging(page, "createConversation", {
        kind: "channel",
        name: title,
      });
      expect(created.error).toBeNull();
      await resize(desktop, size.width, size.height);
      await page.keyboard.press("Control+k");
      await page
        .getByRole("combobox", { name: "Search workspace", exact: true })
        .fill("responsive-");
      const search = page.getByRole("region", { name: "Workspace search", exact: true });
      await fitsWindow(search);
      await fitsWindow(search.getByRole("link", { name: `conversation · ${title}`, exact: true }));
      await fitsWindow(
        search.getByRole("button", { name: `Find related records for ${title}`, exact: true }),
      );
      for (const name of ["All", "Tasks", "Projects", "Messages", "Channels"])
        await fitsWindow(search.getByRole("button", { name, exact: true }));
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: /^Signed in as / }).click();
      const menu = page.getByRole("dialog", { name: "User actions", exact: true });
      await fitsWindow(menu);
      for (const name of ["Organization settings", "Use system theme", "Sign out"])
        await fitsWindow(menu.getByRole("button", { name, exact: true }));
      await fitsWindow(menu.getByRole("switch", { name: "Dark mode", exact: true }));
      await page.keyboard.press("Escape");
      await page
        .getByRole("navigation", { name: "Apps", exact: true })
        .getByRole("button", { name: "Notifications", exact: true })
        .click();
      const notifications = page.getByRole("region", { name: "Notifications", exact: true });
      await fitsWindow(notifications.getByRole("heading", { name: "Notifications", exact: true }));
      await fitsWindow(notifications.getByRole("button", { name: /^Unread/ }));
      await expect
        .poll(() =>
          notifications.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        )
        .toBe(true);
    },
  );
}

test(
  "title-bar search fits on both sides of its 400px breakpoint",
  { tag: "@layout" },
  async ({ desktop }) => {
    await desktop.provision();
    for (const width of [401, 400]) {
      await resize(desktop, width, 768);
      const search = desktop.page.getByRole("combobox", { name: "Search workspace", exact: true });
      await fitsWindow(search);
      await search.click({ trial: true });
    }
  },
);
