import { createChannel } from "../messaging/test-support.js";
import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("title-bar search opens records from every workspace view", async ({ desktop }) => {
  await desktop.provision();
  const { page } = desktop;
  await createChannel(page, "global-search-review");
  const bar = page.getByRole("banner", { name: "Window title bar" });
  const input = bar.getByRole("combobox", { name: "Search workspace", exact: true });
  await expect(input).toBeVisible();
  const field = input.locator("..");
  expect((await field.boundingBox())!.height).toBe(28);
  const fieldBounds = (await field.boundingBox())!;
  expect(
    Math.abs(fieldBounds.x + fieldBounds.width / 2 - (await page.evaluate(() => innerWidth / 2))),
  ).toBeLessThanOrEqual(1);
  expect((await field.boundingBox())!.y).toBeGreaterThan(0);
  expect((await field.boundingBox())!.y + (await field.boundingBox())!.height).toBeLessThan(
    (await bar.boundingBox())!.height,
  );
  await expect(page.getByRole("combobox", { name: "Search workspace", exact: true })).toHaveCount(
    1,
  );
  expect(
    (await page.getByRole("complementary", { name: "Conversations", exact: true }).boundingBox())!
      .y,
  ).toBe((await bar.boundingBox())!.height);
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  for (const [path, label] of [
    ["/tasks", "Tasks"],
    ["/notifications", "Notifications"],
    ["/settings/user", "User settings"],
    ["/settings/organization", "Organization settings"],
  ] as const) {
    if (path.startsWith("/settings")) {
      await page.getByRole("button", { name: /^Signed in as / }).click();
      await page.getByRole("button", { name: label, exact: true }).click();
    } else {
      await page
        .getByRole("navigation", { name: "Apps", exact: true })
        .getByRole("button", { name: label, exact: true })
        .click();
    }
    await expect(page).toHaveURL(new RegExp(`${path}/?(?:\\?|$)`));
    if (path.startsWith("/settings"))
      await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Workspace search", exact: true })).toBeHidden();
    await page.keyboard.press(`${modifier}+k`);
    await expect(input).toBeFocused();
    await input.fill("global-search-review");
    const results = page.getByRole("region", { name: "Workspace search", exact: true });
    const result = results.getByRole("link", {
      name: "conversation · global-search-review",
      exact: true,
    });
    await expect(result).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(results).toBeHidden();
    await expect(input).toBeFocused();
    await page.keyboard.press(`${modifier}+k`);
    if (path === "/tasks") await page.keyboard.press("Enter");
    else await result.click();
    await expect(
      page.getByRole("heading", { name: "global-search-review", exact: true }),
    ).toBeVisible();
    await expect(results).toBeHidden();
  }
  await input.click();
  await input.fill("global-search-review");
  const results = page.getByRole("region", { name: "Workspace search", exact: true });
  await results
    .getByRole("link", { name: "conversation · global-search-review", exact: true })
    .click();
  await expect(results).toBeHidden();
  await desktop.signout();
  await expect(input).toHaveCount(0);
  await expect(bar).toContainText("Startup OS");
});

test(
  "title-bar search and results fit a narrow zoomed window",
  { tag: "@layout" },
  async ({ desktop }) => {
    await desktop.provision();
    const { page } = desktop;
    await desktop.app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(320, 200);
      window.setContentSize(480, 640);
      window.webContents.setZoomFactor(1.25);
    });
    const bar = page.getByRole("banner", { name: "Window title bar" });
    const input = bar.getByRole("combobox", { name: "Search workspace", exact: true });
    await expect(input).toBeVisible();
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(384);
    // Native control insets update asynchronously after resizing and changing zoom.
    await expect(async () => {
      const fieldBounds = (await input.locator("..").boundingBox())!;
      const safeArea = await bar.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          left: Number.parseFloat(style.paddingLeft),
          right: innerWidth - Number.parseFloat(style.paddingRight),
        };
      });
      expect(
        Math.abs(fieldBounds.x + fieldBounds.width / 2 - (safeArea.left + safeArea.right) / 2),
      ).toBeLessThanOrEqual(1);
      expect(fieldBounds.x).toBeGreaterThanOrEqual(safeArea.left);
      expect(fieldBounds.x + fieldBounds.width).toBeLessThanOrEqual(safeArea.right);
    }).toPass({ timeout: 15_000 });
    await input.click();
    const results = page.getByRole("region", { name: "Workspace search", exact: true });
    await expect(results).toBeVisible();
    for (const element of [input, results]) {
      const bounds = (await element.boundingBox())!;
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      expect(
        await element.evaluate((node) =>
          getComputedStyle(node).getPropertyValue("-webkit-app-region"),
        ),
      ).toBe("no-drag");
    }
    expect((await results.boundingBox())!.y).toBeGreaterThanOrEqual(
      (await bar.boundingBox())!.height,
    );
  },
);
