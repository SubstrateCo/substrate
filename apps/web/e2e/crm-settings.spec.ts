import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("CRM settings show aligned, compact sections without scrolling past save actions", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  await page.setViewportSize({ width: 1440, height: 720 });
  await visit(user, undefined, "/crm", { section: "settings" });
  const pipeline = page.getByRole("region", { name: "Pipeline", exact: true });
  const defaults = page.getByRole("region", { name: "Deal defaults", exact: true });
  await expect(pipeline.getByRole("textbox", { name: "Stage 1 name" })).toBeVisible();
  await expect(defaults.getByRole("combobox", { name: "Default currency" })).toBeVisible();
  await expect(pipeline.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
  await expect(defaults.getByRole("button", { name: "Save", exact: true })).toBeInViewport();
  const pipelineBox = await pipeline.boundingBox();
  const defaultsBox = await defaults.boundingBox();
  expect(pipelineBox!.y).toBeGreaterThan(defaultsBox!.y + defaultsBox!.height);
  const headingBox = await page
    .getByRole("heading", { name: "CRM settings", exact: true })
    .boundingBox();
  expect(pipelineBox!.x).toBe(headingBox!.x);
  const stageBox = await pipeline.getByRole("textbox", { name: "Stage 1 name" }).boundingBox();
  const currencyBox = await defaults
    .getByRole("combobox", { name: "Default currency" })
    .boundingBox();
  const stagesBox = await pipeline.getByRole("list").boundingBox();
  expect(stageBox!.width).toBeLessThanOrEqual(480);
  expect(stageBox!.x).toBeGreaterThan(pipelineBox!.x);
  expect(currencyBox!.x).toBe(stagesBox!.x);

  await pipeline.getByRole("textbox", { name: "Stage 1 name" }).fill("Qualified lead");
  await defaults.getByRole("combobox", { name: "Default currency" }).click();
  await page.getByRole("option", { name: "USD", exact: true }).click();
  await expect(pipeline.getByRole("textbox", { name: "Stage 1 name" })).toHaveValue(
    "Qualified lead",
  );
  await expect(defaults.getByRole("button", { name: "Discard", exact: true })).toBeVisible();
  await defaults.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(pipeline.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await pipeline.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(pipeline.getByRole("textbox", { name: "Stage 1 name" })).not.toHaveValue(
    "Qualified lead",
  );

  await page.setViewportSize({ width: 800, height: 720 });
  await expect(pipeline.getByRole("textbox", { name: "Stage 1 name" })).toBeInViewport();
  await expect(defaults.getByRole("combobox", { name: "Default currency" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(800);
});
