import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  test(`composed related search restores the real input focus in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await page.goto(
      `/iframe.html?id=scenes-workspace-connected-tools--ready&viewMode=story&globals=theme:${theme}`,
    );
    const input = page.getByRole("combobox", { name: "Search workspace", exact: true });
    await input.fill("Ship");
    await page
      .getByRole("button", { name: "Find related records for Ship the launch", exact: true })
      .click();
    await expect(page.getByText("Related records", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "project · Customer portal", exact: true }),
    ).toBeVisible();
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    await page.keyboard.type("abc");
    await expect(input).toHaveValue("abc");
    await page.screenshot({
      path: `C:/Users/mahar/AppData/Local/Temp/opencode/pass2-related-${theme}-900x600.png`,
    });
  });

  for (const width of [900, 390]) {
    test(`complete search panel fits ${width}x300 in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 300 });
      await page.goto(
        `/iframe.html?id=scenes-workspace-connected-tools--ready&viewMode=story&globals=theme:${theme}`,
      );
      const input = page.getByRole("combobox", { name: "Search workspace", exact: true });
      await input.click();
      const panel = page.getByRole("region", { name: "Workspace search", exact: true });
      await expect(panel).toBeVisible();
      await expect
        .poll(async () => {
          const bounds = await panel.boundingBox();
          return bounds ? bounds.y + bounds.height : Infinity;
        })
        .toBeLessThanOrEqual(300);
      await expect(panel.getByText("to close", { exact: false })).toBeInViewport({ ratio: 1 });
      await input.press("End");
      const last = page.getByRole("option", { selected: true });
      await expect(last).toContainText("Partner launch");
      await expect(last).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: `C:/Users/mahar/AppData/Local/Temp/opencode/pass2-search-${theme}-${width}x300.png`,
      });
      await input.press("Enter");
      await expect(page).toHaveURL(/#channel$/);
    });
  }
}
