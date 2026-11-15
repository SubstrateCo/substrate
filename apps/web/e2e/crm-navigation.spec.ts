import { captureCrm } from "./test-support/crm";
import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("Contacts is a separate app and CRM keeps only deals, accounts, and settings", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await visit(user, undefined, "/crm");
  const navigation = user.page.getByRole("navigation", { name: "CRM", exact: true });
  await expect(navigation.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link", { name: "Contacts", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link")).toHaveCount(3);
  for (const name of ["Deals", "Accounts", "Settings"])
    await expect(navigation.getByRole("link", { name, exact: true })).toBeVisible();
  await captureCrm(user.page, "32-crm-without-reports");
  await navigation.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(user.page.getByRole("heading", { name: "CRM settings", exact: true })).toBeVisible();
  await user.page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("link", { name: "Contacts", exact: true })
    .click();
  await expect(user.page).toHaveURL(/\/contacts/);
  await expect(user.page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  await expect(user.page.getByRole("navigation", { name: "CRM", exact: true })).toHaveCount(0);
});
