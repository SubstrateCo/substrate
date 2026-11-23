import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

for (const [section, singular] of [
  ["accounts", "account"],
  ["deals", "deal"],
] as const) {
  test(`${section} header has an icon download and a labelled create`, async ({
    account,
    client,
  }) => {
    const user = await client(account);
    const { page } = user;
    await visit(user, undefined, "/crm", { section });
    // The header create comes first; an empty list repeats it in its notice.
    const create = page.getByRole("button", { name: `New ${singular}`, exact: true }).first();
    const download = page.getByRole("button", { name: `Download ${section}`, exact: true });
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
