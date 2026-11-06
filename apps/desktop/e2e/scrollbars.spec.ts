import { test } from "./fixture.js";
import { expect } from "@playwright/test";

test("scrollbars appear while scrolling and disappear when idle", async ({ desktop }) => {
  const page = desktop.page;
  await expect(
    page.getByRole("button", { name: "Sign in with browser", exact: true }),
  ).toBeVisible();
  await desktop.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.setMinimumSize(320, 200);
    BrowserWindow.getAllWindows()[0]!.setSize(500, 250);
  });

  const panel = page.locator('[data-slot="card"]');
  await expect.poll(() => panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const thumbColor = () =>
    panel.evaluate((el) => getComputedStyle(el, "::-webkit-scrollbar-thumb").backgroundColor);
  await expect.poll(thumbColor).toBe("rgba(0, 0, 0, 0)");

  await panel.hover();
  await expect.poll(thumbColor).toBe("rgba(0, 0, 0, 0)");
  const width = await panel.evaluate((el) => el.clientWidth);
  await page.mouse.wheel(0, 60);
  await expect.poll(() => panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await expect.poll(thumbColor).not.toBe("rgba(0, 0, 0, 0)");
  await expect.poll(thumbColor).toBe("rgba(0, 0, 0, 0)");
  expect(await panel.evaluate((el) => el.clientWidth)).toBe(width);

  await page.mouse.wheel(0, -60);
  await expect.poll(thumbColor).not.toBe("rgba(0, 0, 0, 0)");
  await expect.poll(thumbColor).toBe("rgba(0, 0, 0, 0)");
});
