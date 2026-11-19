import { createCrm } from "../../server/integration/test-support/crm";
import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("export downloads a CSV with the workspace's account records", async ({ account, client }) => {
  const name = "Northstar Export";
  await createCrm(account, { action: "createAccount", name });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/crm", { section: "accounts" });

  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await pending;

  expect(download.suggestedFilename()).toBe("crm-accounts.csv");
  const csv = await readFile(await download.path(), "utf8");
  expect(csv).toContain('"entityId","name","website","domain","archivedAt"');
  expect(csv).toContain(`,"${name}",`);
});
