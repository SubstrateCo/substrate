import { captureCrm } from "./test-support/crm";
import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("CRM navigation contains only deals, accounts, contacts, and settings", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await visit(user, undefined, "/crm");
  const navigation = user.page.getByRole("navigation", { name: "CRM", exact: true });
  await expect(navigation.getByRole("link", { name: "Reports", exact: true })).toHaveCount(0);
  await expect(navigation.getByRole("link")).toHaveCount(4);
  for (const name of ["Deals", "Accounts", "Contacts", "Settings"])
    await expect(navigation.getByRole("link", { name, exact: true })).toBeVisible();
  await captureCrm(user.page, "32-crm-without-reports");
  await navigation.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(user.page.getByRole("heading", { name: "CRM settings", exact: true })).toBeVisible();
});
