import { expect, test } from "@playwright/test";

for (const [story, field, action] of [
  ["sign-in", "Password", "Sign in"],
  ["sign-up", "Password", "Create account"],
  ["forgot-password", "Email", "Send reset link"],
]) {
  test(`${story} keeps its action next to the last field`, async ({ page }) => {
    await page.goto(`/iframe.html?id=scenes-account-authentication--${story}&viewMode=story`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const input = await page.getByLabel(field, { exact: true }).boundingBox();
    const button = await page.getByRole("button", { name: action, exact: true }).boundingBox();
    expect(button!.y - (input!.y + input!.height)).toBeLessThanOrEqual(24);
    expect(button!.y).toBeGreaterThan(input!.y + input!.height);
  });
}

for (const theme of ["light", "dark"]) {
  test(`signup fits a short desktop window in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.goto(
      `/iframe.html?id=scenes-account-authentication--sign-up&viewMode=story&globals=theme:${theme}`,
    );
    await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeInViewport({
      ratio: 1,
    });
  });

  test(`profile has one appearance label in ${theme} mode`, async ({ page }) => {
    await page.goto(
      `/iframe.html?id=scenes-workspace-user-settings--profile&viewMode=story&globals=theme:${theme}`,
    );
    await expect(page.getByText("Appearance", { exact: true })).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Display preferences", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("switch", { name: "Dark mode", exact: true })).toBeVisible();
  });
}
