import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

for (const [section, singular] of [
  ["accounts", "account"],
  ["deals", "deal"],
] as const) {
  test(`${section} header groups accessible icon actions`, async ({ account, client }) => {
    const user = await client(account);
    const { page } = user;
    await visit(user, undefined, "/crm", { section });
    const actions = page.getByRole("group", { name: "CRM actions", exact: true });
    const create = actions.getByRole("button", { name: `New ${singular}`, exact: true });
    await create.focus();
    await expect(page.getByRole("tooltip", { name: `New ${singular}`, exact: true })).toBeVisible();
    const download = actions.getByRole("button", { name: `Download ${section}`, exact: true });
    await download.focus();
    await expect(
      page.getByRole("tooltip", { name: `Download ${section}`, exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Download CSV", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Download JSON", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(download).toBeFocused();

    await create.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: `New ${singular}`, exact: true })).toBeVisible();
  });
}
