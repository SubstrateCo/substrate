import { test } from "./fixtures";
import { expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

export async function captureScreenshot(
  page: Page,
  name: string,
  options: { fullPage?: boolean } = {},
) {
  if (!process.env.E2E_CAPTURE_SCREENSHOTS && !process.env.E2E_SCREENSHOTS_DIR) return;
  await expect(
    page.getByText(/Reconnecting to live updates|Live updates disconnected/),
  ).toHaveCount(0);
  const directory = process.env.E2E_SCREENSHOTS_DIR
    ? resolve(process.env.E2E_SCREENSHOTS_DIR)
    : resolve(test.info().project.outputDir, "screenshots");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${name}.png`);
  await page.screenshot({ path, animations: "disabled", fullPage: options.fullPage ?? true });
  await test.info().attach(name, { path, contentType: "image/png" });
}
