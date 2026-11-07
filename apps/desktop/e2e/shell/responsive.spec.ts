import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { expect, type Locator, type Page } from "@playwright/test";

async function withinViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(
    await locator.evaluate((element) => {
      const box = element.getBoundingClientRect();
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (style.display === "contents") continue;
        const bounds = parent.getBoundingClientRect();
        if (
          /(auto|scroll|hidden|clip)/.test(style.overflowX) &&
          (box.left < bounds.left - 1 || box.right > bounds.right + 1)
        )
          return false;
        if (
          /(auto|scroll|hidden|clip)/.test(style.overflowY) &&
          (box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1)
        )
          return false;
      }
      return true;
    }),
    "The element fits all clipping ancestors",
  ).toBe(true);
}

for (const size of [
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
  { width: 320, height: 812 },
  { width: 320, height: 568 },
]) {
  test(`workspace search, menus and notifications fit ${size.width}x${size.height} Electron`, async ({
    desktop,
  }) => {
    test.setTimeout(120_000);
    const page = desktop.page;
    expect(
      await desktop.app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getMinimumSize()[0],
      ),
      "The normal desktop window permits the tested width",
    ).toBeLessThanOrEqual(size.width);
    await desktop.app.evaluate(({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setContentSize(size.width, size.height);
    }, size);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(size.width);
    await expect.poll(() => page.evaluate(() => innerHeight)).toBe(size.height);
    await withinViewport(
      page,
      page.getByRole("button", { name: "Sign in with browser", exact: true }),
    );
    await desktop.provision();
    const renamed = await page.evaluate(async () => {
      const session = await (await fetch("/api/v1/session")).json();
      return (
        await fetch("/api/auth/organization/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: session.data.session.activeOrganizationId,
            data: { name: "ResponsiveOrganization".repeat(3) },
          }),
        })
      ).ok;
    });
    expect(renamed, "Long workspace names can be saved").toBe(true);
    await page.reload();
    const title = `responsive-${"longchannelname".repeat(4)}`;
    const created = await callMessaging(page, "createConversation", {
      kind: "channel",
      name: title,
    });
    expect(created.error).toBeNull();
    await page.keyboard.press("Control+k");
    const input = page.getByRole("combobox", { name: "Search workspace", exact: true });
    await input.fill("responsive-");
    const search = page.getByRole("region", { name: "Workspace search", exact: true });
    const result = search.getByRole("link", { name: `conversation · ${title}`, exact: true });
    await expect(result).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("search.png"), animations: "disabled" });
    await withinViewport(page, search);
    await withinViewport(page, result);
    await withinViewport(
      page,
      search.getByRole("button", { name: `Find related records for ${title}`, exact: true }),
    );
    expect(
      await search.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    for (const name of ["All", "Tasks", "Projects", "Messages", "Channels"]) {
      await withinViewport(page, search.getByRole("button", { name, exact: true }));
    }
    await page.keyboard.press("Escape");
    await expect(search).toBeHidden();
    await expect(input).toBeFocused();
    await input.click();
    await search.getByRole("button", { name: "Channels", exact: true }).click();
    await result.click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await withinViewport(page, page.getByText(`Welcome to #${title}`, { exact: true }));

    await page.getByRole("button", { name: /^Signed in as / }).click();
    const userMenu = page.getByRole("dialog", { name: "User actions", exact: true });
    await page.screenshot({
      path: test.info().outputPath("user-menu.png"),
      animations: "disabled",
    });
    await withinViewport(page, userMenu);
    expect(
      await userMenu.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await withinViewport(
      page,
      userMenu.getByRole("button", { name: "Organization settings", exact: true }),
    );
    const darkMode = userMenu.getByRole("switch", { name: "Dark mode", exact: true });
    await darkMode.setChecked(true);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await darkMode.setChecked(false);
    await expect(page.locator("html")).not.toHaveClass(/dark/);
    await page.keyboard.press("Escape");
    await page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: "Notifications", exact: true })
      .click();
    const notifications = page.getByRole("region", { name: "Notifications", exact: true });
    await withinViewport(
      page,
      notifications.getByRole("heading", { name: "Notifications", exact: true }),
    );
    await page.screenshot({
      path: test.info().outputPath("notifications.png"),
      animations: "disabled",
    });
    await notifications.getByRole("button", { name: /^Unread/ }).click();
    await expect(notifications.getByText("You’re all caught up", { exact: true })).toBeVisible();
    expect(
      await notifications.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBeLessThanOrEqual(1);
    await page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: "Messages", exact: true })
      .click();
    await expect(notifications).toBeHidden();
  });
}
