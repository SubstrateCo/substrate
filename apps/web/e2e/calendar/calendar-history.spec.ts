import { seedCalendar } from "../test-support/calendar";
import { visit } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test("calendar history restores its original view and event dismissal preserves Forward", async ({
  account,
  client,
}) => {
  const response = await account.request.patch("/api/v1/organizations/apps", {
    data: {
      organizationId: account.organizationId,
      enabledApps: ["messages", "agents", "tasks", "crm", "calendar"],
    },
  });
  expect(response.ok()).toBe(true);
  await seedCalendar(account);
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/calendar", { date: "2020-01-15" });
  const picker = page.getByRole("combobox", { name: "Calendar view", exact: true });
  await expect(picker).toHaveText("Agenda");
  await expect(page).toHaveURL(/view=agenda/);
  await picker.click();
  await page.getByRole("option", { name: "Month", exact: true }).click();
  await expect(picker).toHaveText("Month");
  await page.goBack();
  await expect(picker).toHaveText("Agenda");
  await page.goForward();
  await expect(picker).toHaveText("Month");
  await page
    .getByRole("region", { name: "Month", exact: true })
    .getByRole("link", { name: /Pricing review/ })
    .click();
  const panel = page.getByRole("complementary", { name: "Event details", exact: true });
  await expect(panel).toBeVisible();
  const length = await page.evaluate(() => history.length);
  await panel.getByRole("button", { name: "Close event", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goForward();
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
});
