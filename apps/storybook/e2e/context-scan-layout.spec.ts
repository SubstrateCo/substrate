import { expect, test, type Locator, type Page } from "@playwright/test";

const notificationTitle = "Customer launch checklist — " + "UnbrokenCustomerReference".repeat(8);
const discussionTitle = "Created from a discussion · " + "LaunchTeam".repeat(20);
const evidence = "C:/Users/mahar/AppData/Local/Temp/opencode/loop2-context-fixed";

async function open(page: Page, story: string, theme: string) {
  await page.goto(`/iframe.html?id=${story}&viewMode=story&globals=theme:${theme}`);
  await expect(page.getByRole("region").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function top(locator: Locator) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  return bounds!.y;
}

async function lineMetrics(locator: Locator) {
  return locator.evaluate((element) => ({
    height: element.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
  }));
}

for (const theme of ["light", "dark"]) {
  for (const width of [1440, 390]) {
    test(`notification columns align at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, "workspace-notifications--ready", theme);
      const heading = await page
        .getByRole("heading", { name: "Notifications", exact: true })
        .boundingBox();
      const filters = await page
        .getByRole("group", { name: "Notification filter", exact: true })
        .boundingBox();
      const row = await page.getByRole("listitem").first().boundingBox();
      expect(heading).not.toBeNull();
      expect(filters).not.toBeNull();
      expect(row).not.toBeNull();
      await page.screenshot({ path: `${evidence}-alignment-${theme}-${width}x900.png` });
      expect(Math.abs(heading!.x - filters!.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(heading!.x - row!.x)).toBeLessThanOrEqual(2);
      expect(row!.width).toBeLessThanOrEqual(768);
    });

    test(`notification preview keeps scan positions stable at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, "workspace-notifications--ready", theme);
      const nextNotification = page.getByRole("link", {
        name: "Mentioned you Alex mentioned you in Launch team",
        exact: true,
      });
      const shortTop = await top(nextNotification);
      await open(page, "workspace-notifications--long-title", theme);
      const link = page.getByRole("link", {
        name: `Assigned to you ${notificationTitle}`,
        exact: true,
      });
      await expect(link).toHaveAccessibleName(`Assigned to you ${notificationTitle}`);
      const metrics = await lineMetrics(link.getByText(notificationTitle, { exact: true }));
      await page.screenshot({ path: `${evidence}-notification-${theme}-${width}x900.png` });
      expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight * 3 + 1);
      expect(Math.abs((await top(nextNotification)) - shortTop)).toBeLessThanOrEqual(
        metrics.lineHeight * 2 + 2,
      );
      await expect(
        page.getByRole("button", { name: "Mark as read", exact: true }).first(),
      ).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });

    test(`discussion preview keeps activity position stable at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, "workspace-related-context--ready", theme);
      const activity = page.getByRole("heading", { name: "Activity", exact: true });
      const shortTop = await top(activity);
      await open(page, "workspace-related-context--long-title", theme);
      const link = page.getByRole("link", { name: discussionTitle, exact: true });
      await expect(link).toHaveAccessibleName(discussionTitle);
      const metrics = await lineMetrics(link);
      await page.screenshot({ path: `${evidence}-discussion-${theme}-${width}x900.png` });
      expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight * 3 + 1);
      expect(Math.abs((await top(activity)) - shortTop)).toBeLessThanOrEqual(
        metrics.lineHeight * 2 + 2,
      );
      await expect(link).toHaveAttribute("href", "#message");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }

  for (const [story, title, linkName] of [
    [
      "workspace-notifications--long-title",
      notificationTitle,
      `Assigned to you ${notificationTitle}`,
    ],
    ["workspace-related-context--long-title", discussionTitle, discussionTitle],
  ]) {
    test(`full title is keyboard-inspectable without navigation in ${story} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 900 });
      await open(page, story!, theme);
      const link = page.getByRole("link", { name: linkName!, exact: true });
      const before = await top(link);
      const url = page.url();
      for (let step = 0; step < 6; step++) {
        await page.keyboard.press("Tab");
        if (await link.evaluate((element) => element === document.activeElement)) break;
      }
      await expect(link).toBeFocused();
      const fullTitle = page.getByRole("tooltip");
      await expect(fullTitle).toBeVisible();
      await expect(fullTitle).toContainText(title!);
      await expect(fullTitle).toBeInViewport({ ratio: 1 });
      expect(
        await fullTitle.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      expect(Math.abs((await top(link)) - before)).toBeLessThanOrEqual(1);
      await expect(page).toHaveURL(url);
      await page.screenshot({ path: `${evidence}-inspection-${story}-${theme}-390x900.png` });
      await link.press("Escape");
      await expect(fullTitle).not.toBeVisible();
      await expect(link).toBeFocused();
      await expect(page).toHaveURL(url);
    });
  }
}
