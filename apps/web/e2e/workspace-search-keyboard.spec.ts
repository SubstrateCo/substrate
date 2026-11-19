import { createCrm } from "../../server/integration/test-support/crm";
import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("a workspace search result opens with Enter and closes the search panel", async ({
  account,
  client,
}) => {
  const title = "Keyboard Search Customer";
  await createCrm(account, { action: "createAccount", name: title });
  const user = await client(account);
  const { page } = user;
  await visit(user);

  const input = page.getByRole("combobox", { name: "Search workspace", exact: true });
  const panel = page.getByRole("region", { name: "Workspace search", exact: true });
  await input.fill(title);
  await expect(panel.getByRole("link", { name: `Account: ${title}`, exact: true })).toBeVisible();
  await input.press("Enter");

  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(panel).toBeHidden();
});
