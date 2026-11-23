import { createCrm } from "../../../server/integration/test-support/crm";
import { visit } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test("account downloads save CSV and JSON files", async ({ account, client }) => {
  await createCrm(account, { action: "createAccount", name: "Northstar Export" });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/crm", { section: "accounts" });
  for (const format of ["CSV", "JSON"]) {
    await page.getByRole("button", { name: "Download accounts", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: `Download ${format}`, exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(`crm-accounts.${format.toLowerCase()}`);
    expect(await download.failure()).toBeNull();
  }
});
