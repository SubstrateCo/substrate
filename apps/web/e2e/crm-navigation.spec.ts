import { createCrm } from "../../server/integration/test-support/crm";
import { captureCrm } from "./test-support/crm";
import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("contacts open as records without a rail entry or collection page", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const contact = await createCrm(account, {
    action: "createContact",
    displayName: "Linked contact",
  });
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
  const apps = user.page.getByRole("navigation", { name: "Apps", exact: true });
  await expect(apps.getByRole("link", { name: "Contacts", exact: true })).toHaveCount(0);
  await visit(user, undefined, "/contacts");
  await expect(user.page).toHaveURL(/\/dashboard/);
  await visit(user, undefined, "/contacts", { recordId: contact.entityId });
  await expect(
    user.page.getByRole("heading", { name: "Linked contact", exact: true }),
  ).toBeVisible();
  await expect(user.page.getByRole("link", { name: "Back to contacts", exact: true })).toHaveCount(
    0,
  );
  await expect(user.page.getByRole("table", { name: "contacts", exact: true })).toHaveCount(0);
  await expect(user.page.getByRole("navigation", { name: "CRM", exact: true })).toHaveCount(0);
  await user.page.reload();
  await expect(
    user.page.getByRole("heading", { name: "Linked contact", exact: true }),
  ).toBeVisible();
});
