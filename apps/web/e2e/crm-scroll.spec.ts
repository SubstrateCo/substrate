import { createCrm } from "../../server/integration/test-support/crm";
import { visit } from "./test-support/fixtures";
import { test } from "./test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test("record lists can scroll to the last row of a long page", async ({ account, client }) => {
  await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      createCrm(account, {
        action: "createAccount",
        name: `Scroll account ${String(index).padStart(2, "0")}`,
      }),
    ),
  );
  const user = await client(account);
  const { page } = user;
  await page.setViewportSize({ width: 1440, height: 720 });
  await visit(user, undefined, "/crm", { section: "accounts" });
  const table = page.getByRole("table", { name: "accounts", exact: true });
  await expect(table.getByRole("row")).toHaveCount(41);
  const lastContact = table.getByRole("link").last();
  const lastName = await lastContact.innerText();
  await expect(lastContact).not.toBeInViewport();
  await table.getByRole("link").first().hover();
  await page.mouse.wheel(0, 5000);
  await expect(lastContact).toBeInViewport();
  // One page of results has no pager.
  await expect(page.getByRole("button", { name: "Next page", exact: true })).toHaveCount(0);
  await lastContact.click();
  await expect(page.getByRole("heading", { name: lastName, exact: true })).toBeVisible();
});
