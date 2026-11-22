import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("CRM sections use a sidebar and preserve section navigation", async ({ account, client }) => {
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/crm", { section: "deals" });
  const sidebar = page.getByRole("complementary", { name: "CRM", exact: true });
  const navigation = sidebar.getByRole("navigation", { name: "CRM", exact: true });
  const deals = navigation.getByRole("link", { name: "Deals", exact: true });
  const accounts = navigation.getByRole("link", { name: "Accounts", exact: true });
  const settings = navigation.getByRole("link", { name: "Settings", exact: true });
  await expect(deals).toHaveAttribute("aria-current", "page");
  await expect(navigation.getByText("CRM", { exact: true })).toHaveCount(0);
  const dealsBounds = await deals.boundingBox();
  const accountsBounds = await accounts.boundingBox();
  expect(dealsBounds).not.toBeNull();
  expect(accountsBounds).not.toBeNull();
  expect(accountsBounds!.x).toBe(dealsBounds!.x);
  expect(accountsBounds!.y).toBeGreaterThan(dealsBounds!.y);

  await accounts.click();
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  await expect(accounts).toHaveAttribute("aria-current", "page");
  await expect(deals).not.toHaveAttribute("aria-current", "page");
  await settings.click();
  await expect(page.getByRole("heading", { name: "CRM settings", exact: true })).toBeVisible();
  await expect(settings).toHaveAttribute("aria-current", "page");
  await page.reload();
  await expect(settings).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 700, height: 900 });
  await expect(deals).toBeInViewport();
  await deals.click();
  await expect(page.getByRole("heading", { name: "Deals", exact: true })).toBeVisible();
});
