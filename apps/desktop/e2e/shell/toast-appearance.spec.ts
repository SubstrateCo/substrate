import { test } from "../test-support/fixture.js";
import { failRequestsAt } from "../test-support/request-failure.js";
import { expect } from "@playwright/test";

for (const dark of [false, true]) {
  test(`refresh toasts match the ${dark ? "dark" : "light"} workspace theme`, async ({
    desktop,
  }) => {
    await desktop.provision();
    const page = desktop.page;
    await page.getByRole("button", { name: /^Signed in as / }).click();
    await page.getByRole("switch", { name: "Dark mode", exact: true }).setChecked(dark);
    await page.keyboard.press("Escape");
    await expect(page.getByText("Your conversations start here", { exact: true })).toBeVisible();

    const failure = await page.evaluateHandle(failRequestsAt, "/api/v1/messaging/conversations");
    const toast = page
      .locator("[data-sonner-toast]")
      .filter({ hasText: "Couldn’t refresh conversations" });
    await expect(toast).toBeVisible();
    await toast.hover();
    await expect(toast).toHaveCSS(
      "background-color",
      dark ? "oklch(0.265 0.016 275)" : "oklch(1 0 0)",
    );
    await expect(toast).toHaveCSS("font-size", "14px");
    await expect(toast).toHaveCSS("border-radius", "8px");
    const font = await page
      .locator("html")
      .evaluate((element) => getComputedStyle(element).fontFamily);
    await expect(toast).toHaveCSS("font-family", font);
    await expect(toast.locator("[data-description]")).toHaveCSS(
      "color",
      dark ? "oklch(0.7 0.018 275)" : "oklch(0.49 0.018 275)",
    );
    await expect(toast.locator("[data-icon] svg")).toHaveCSS(
      "color",
      dark ? "oklch(0.704 0.191 22.216)" : "oklch(0.52 0.22 27.325)",
    );
    const close = toast.getByRole("button", { name: "Close toast", exact: true });
    const bounds = (await toast.boundingBox())!;
    const closeBounds = (await close.boundingBox())!;
    expect(closeBounds.x).toBeGreaterThan(bounds.x + bounds.width / 2);
    expect(closeBounds.x + closeBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(closeBounds.y).toBeGreaterThanOrEqual(bounds.y);

    const retry = toast.getByRole("button", { name: "Retry", exact: true });
    const contentBounds = (await toast.locator("[data-content]").boundingBox())!;
    const iconBounds = (await toast.locator("[data-icon]").boundingBox())!;
    const retryBounds = (await retry.boundingBox())!;
    const contentCenter = contentBounds.y + contentBounds.height / 2;
    expect(Math.abs(iconBounds.y + iconBounds.height / 2 - contentCenter)).toBeLessThanOrEqual(1);
    expect(Math.abs(retryBounds.y + retryBounds.height / 2 - contentCenter)).toBeLessThanOrEqual(1);
    await expect(retry).toHaveCSS("height", "28px");
    await expect(retry).toHaveCSS(
      "background-color",
      dark ? "oklch(0.235 0.014 275)" : "oklch(1 0 0)",
    );
    await close.focus();
    await page.keyboard.press("Tab");
    await expect(retry).toBeFocused();
    await expect(retry).not.toHaveCSS("box-shadow", "none");
    await failure.evaluate((control) => control.recover());
    await page.keyboard.press("Enter");
    await expect(toast).toHaveCount(0);
    await expect(page.getByText("Conversations may be out of date.", { exact: true })).toHaveCount(
      0,
    );
  });
}
