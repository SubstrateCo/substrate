import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test(
  "settings use underline navigation and separate organization invitations",
  { tag: "@layout" },
  async ({ desktop }) => {
    await desktop.provision();
    const page = desktop.page;
    await desktop.openPath("/settings/user");
    const tabs = page.getByRole("tablist", { name: "User settings", exact: true });
    await expect(tabs).toHaveAttribute("data-variant", "line");
    const selected = tabs.getByRole("tab", { name: "Profile and appearance", exact: true });
    await expect(selected).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("tabpanel", { name: "Profile and appearance", exact: true }),
    ).toHaveAttribute("id", (await selected.getAttribute("aria-controls"))!);
    await expect
      .poll(() => selected.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe("rgba(0, 0, 0, 0)");
    await expect
      .poll(() => selected.evaluate((element) => getComputedStyle(element, "::after").opacity))
      .toBe("1");
    await expect(tabs).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const screenshot = test.info().outputPath("underline-user-settings.png");
    await page.screenshot({ path: screenshot });
    await test.info().attach("underline-user-settings", {
      path: screenshot,
      contentType: "image/png",
    });
    await tabs.getByRole("tab", { name: "Invitations", exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/user\/invitations$/);
    await expect(
      page.getByRole("heading", { name: "Your invitations", exact: true }),
    ).toBeVisible();
    await tabs.getByRole("tab", { name: "Agents", exact: true }).click();
    await expect(page.getByRole("button", { name: "Create agent", exact: true })).toBeVisible();
    await desktop.openPath("/settings/organization");
    const organizationTabs = page.getByRole("tablist", {
      name: "Organization settings",
      exact: true,
    });
    await expect(organizationTabs).toHaveAttribute("data-variant", "line");
    await expect(
      page.getByRole("region", { name: "Organization logo", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Send invitation", exact: true })).toBeHidden();
    await organizationTabs.getByRole("tab", { name: "Invitations", exact: true }).click();
    await expect(page.getByRole("button", { name: "Send invitation", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Organization logo", exact: true })).toBeHidden();
    await page.getByRole("button", { name: /^Signed in as / }).click();
    await expect(page.getByRole("dialog", { name: "User actions", exact: true })).toBeVisible();
  },
);
