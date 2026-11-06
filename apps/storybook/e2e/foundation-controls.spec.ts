import { expect, test } from "@playwright/test";

const evidence = process.env.FOUNDATION_REVIEW_EVIDENCE;

for (const theme of ["light", "dark"]) {
  test(`inline form error text contrasts with its composited background in ${theme}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto(
      `/iframe.html?id=foundations-review-controls--inline-error&viewMode=story&globals=theme:${theme}`,
    );
    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toHaveText("We couldn’t complete this action. Please try again.");
    const colors = await alert.locator('[data-slot="alert-description"]').evaluate((node) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const rgba = (color: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      };
      const over = (front: number[], back: number[]) =>
        front
          .slice(0, 3)
          .map((v, i) => (v * front[3]!) / 255 + back[i]! * (1 - front[3]! / 255))
          .concat(255);
      const ancestors: Element[] = [];
      for (let parent: Element | null = node; parent; parent = parent.parentElement)
        ancestors.unshift(parent);
      const background = ancestors.reduce(
        (color, parent) => over(rgba(getComputedStyle(parent).backgroundColor), color),
        [255, 255, 255, 255],
      );
      const text = over(rgba(getComputedStyle(node).color), background);
      const luminance = (color: number[]) =>
        color
          .slice(0, 3)
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
      return {
        text,
        background,
        contrast:
          (Math.max(luminance(text), luminance(background)) + 0.05) /
          (Math.min(luminance(text), luminance(background)) + 0.05),
      };
    });
    console.log("inline error", theme, JSON.stringify(colors));
    if (evidence) await page.screenshot({ path: `${evidence}/inline-error-${theme}.png` });
    expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
  });

  test(`input boundary contrasts with its composited surfaces in ${theme}`, async ({ page }) => {
    await page.goto(
      `/iframe.html?id=foundations-review-controls--input-boundary&viewMode=story&globals=theme:${theme}`,
    );
    const input = page.getByRole("textbox", { name: "Workspace name" });
    await expect(input).toBeVisible();
    const ratios = await input.evaluate((node) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const rgba = (color: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      };
      const over = (front: number[], back: number[]) =>
        front
          .slice(0, 3)
          .map((v, i) => (v * front[3]!) / 255 + back[i]! * (1 - front[3]! / 255))
          .concat(255);
      const ancestors: Element[] = [];
      for (let parent = node.parentElement; parent; parent = parent.parentElement)
        ancestors.unshift(parent);
      const outside = ancestors.reduce(
        (color, parent) => over(rgba(getComputedStyle(parent).backgroundColor), color),
        [255, 255, 255, 255],
      );
      const style = getComputedStyle(node);
      const inside = over(rgba(style.backgroundColor), outside);
      const boundary = over(rgba(style.borderTopColor), inside);
      const luminance = (color: number[]) =>
        color
          .slice(0, 3)
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
      const contrast = (a: number[], b: number[]) =>
        (Math.max(luminance(a), luminance(b)) + 0.05) /
        (Math.min(luminance(a), luminance(b)) + 0.05);
      return {
        outside: contrast(boundary, outside),
        inside: contrast(boundary, inside),
        colors: { boundary, outside, inside },
      };
    });
    console.log(theme, JSON.stringify(ratios));
    expect(ratios.outside).toBeGreaterThanOrEqual(3);
    expect(ratios.inside).toBeGreaterThanOrEqual(3);
    if (evidence) await page.screenshot({ path: `${evidence}/input-${theme}.png` });
  });

  test(`workspace refresh is an inline notice with keyboard recovery in ${theme}`, async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 320, height: 640 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(
        `/iframe.html?id=scenes-system-feedback--workspace-details-error&viewMode=story&globals=theme:${theme}`,
      );
      const alert = page.getByRole("alert");
      await expect(alert).toBeVisible();
      await expect(page.getByRole("heading", { name: "Your workspace stays open" })).toBeVisible();
      const box = (await alert.boundingBox())!;
      console.log(theme, viewport.width, "refresh height", box.height);
      expect(box.height).toBeLessThan(viewport.width > 400 ? 100 : 180);
      expect(
        await alert
          .getByRole("heading")
          .evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
      ).toBe(14);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
      if (evidence)
        await page.screenshot({ path: `${evidence}/workspace-${theme}-${viewport.width}.png` });
      const retry = alert.getByRole("button", { name: "Try again" });
      await retry.focus();
      await expect(retry).toBeFocused();
      await retry.press("Enter");
      await expect(alert).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Your workspace stays open" })).toBeVisible();
    }
  });

  test(`full-page feedback has page-level headings in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 960, height: 420 });
    for (const story of ["unexpected-error", "page-not-found"]) {
      await page.goto(
        `/iframe.html?id=scenes-system-feedback--${story}&viewMode=story&globals=theme:${theme}`,
      );
      const heading = page.getByRole("heading", { level: 1 });
      await expect(heading).toBeVisible();
      expect(
        await heading.evaluate((node) => parseFloat(getComputedStyle(node).fontSize)),
      ).toBeGreaterThanOrEqual(20);
      if (evidence) await page.screenshot({ path: `${evidence}/${story}-${theme}-short.png` });
    }
  });
}

test("appearance makes System explicit and follows live OS changes only in system mode", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/iframe.html?id=foundations-review-controls--appearance&viewMode=story");
  const system = page.getByRole("button", { name: "Use system theme", exact: true });
  const toggle = page.getByRole("switch", { name: "Dark mode", exact: true });
  await expect(system).toHaveText("System");
  await expect(system).toHaveAttribute("aria-pressed", "false");
  const manualBackground = await system.evaluate((node) => getComputedStyle(node).backgroundColor);
  await system.focus();
  await expect(system).toBeFocused();
  expect(await system.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe("none");
  await system.press("Enter");
  await expect(system).toHaveAttribute("aria-pressed", "true");
  expect(await system.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(
    manualBackground,
  );
  if (evidence) await page.screenshot({ path: `${evidence}/appearance-system-light.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(toggle).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/dark/);
  if (evidence) await page.screenshot({ path: `${evidence}/appearance-system-dark.png` });
  await page.keyboard.press("Tab");
  await expect(toggle).toBeFocused();
  await page.keyboard.press("Space");
  await expect(toggle).not.toBeChecked();
  await expect(system).toHaveAttribute("aria-pressed", "false");
  await page.emulateMedia({ colorScheme: "light" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(toggle).not.toBeChecked();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});
