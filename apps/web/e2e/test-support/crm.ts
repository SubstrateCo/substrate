import { expect, type Page } from "@playwright/test";

export async function selectCrmOption(page: Page, label: string, name: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByRole("combobox", { name: label, exact: true })).toContainText(name);
}
