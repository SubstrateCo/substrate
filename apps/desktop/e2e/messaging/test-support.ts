import { expect, type Page } from "@playwright/test";

export async function createChannel(page: Page, name: string) {
  await page
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("button", { name: "Create channel", exact: true })
    .click();
  await page.getByLabel("Channel name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create channel", exact: true }).last().click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
