import { expect, test } from "@playwright/test";

for (const story of ["file-selection", "organization-logo", "upload-states"]) {
  test(`${story} stays within a 320px viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(
      `/iframe.html?id=components-uploads--${story}&viewMode=story&globals=theme:dark`,
    );
    if (story === "file-selection") {
      await expect(page.getByRole("button", { name: "Choose files", exact: true })).toBeVisible();
    } else if (story === "organization-logo") {
      await expect(page.getByRole("button", { name: "Choose picture", exact: true })).toBeVisible();
    } else {
      await expect(
        page.getByRole("button", { name: "Retry upload of proposal.pdf" }),
      ).toBeVisible();
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      "Upload stories do not force horizontal scrolling at narrow widths",
    ).toBe(true);
  });
}
