import { createCrm } from "../../server/integration/test-support/crm";
import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("search shows inert loading rows until real results can be opened", async ({
  account,
  client,
}) => {
  const title = "Skeleton Search Customer";
  await createCrm(account, { action: "createAccount", name: title });
  const user = await client(account);
  const { page } = user;
  await visit(user);

  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();
  await page.route("**/api/v1/context/search", async (route) => {
    if (route.request().postDataJSON().query !== title) return route.continue();
    const response = await route.fetch();
    ready.resolve();
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      delivered.resolve();
    }
  });

  const input = page.getByRole("combobox", { name: "Search workspace", exact: true });
  const panel = page.getByRole("region", { name: "Workspace search", exact: true });
  await input.fill(title);
  await ready.promise;
  try {
    const status = panel.getByRole("status");
    await expect(status).toContainText("Searching workspace");
    await expect(status.locator('[data-slot="skeleton"]').first()).toBeVisible();
    await expect(status.getByRole("link")).toHaveCount(0);
    await expect(status.getByRole("button")).toHaveCount(0);
    await expect(panel.getByRole("option")).toHaveCount(0);
  } finally {
    release.resolve();
    await delivered.promise;
  }

  await expect(panel.getByRole("link", { name: `Account: ${title}`, exact: true })).toBeVisible();
  await input.press("Enter");
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(panel).toBeHidden();
});
