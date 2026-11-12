import { test } from "./fixtures";
import { expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export async function captureCrm(page: Page, name: string) {
  await expect(
    page.getByText(/Reconnecting to live updates|Live updates disconnected/),
  ).toHaveCount(0);
  const directory = resolve(test.info().project.outputDir, "crm-screenshots");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${name}.png`);
  await page.screenshot({ path, animations: "disabled", fullPage: true });
  await test.info().attach(name, { path, contentType: "image/png" });
  return path;
}

export async function selectCrmOption(page: Page, label: string, name: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByRole("combobox", { name: label, exact: true })).toContainText(name);
}
