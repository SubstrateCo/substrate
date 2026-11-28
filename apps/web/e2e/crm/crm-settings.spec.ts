import { visit } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test("CRM settings discard drafts independently and persist both sections", async ({
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
  for (const section of [pipeline, defaults]) {
    const save = section.getByRole("button", { name: "Save", exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
  }
  await pipeline.getByRole("textbox", { name: "Stage 1 name" }).fill("Qualified lead");
  await defaults.getByRole("combobox", { name: "Default currency" }).click();
  await page.getByRole("option", { name: "USD", exact: true }).click();
  await expect(pipeline.getByRole("textbox", { name: "Stage 1 name" })).toHaveValue(
    "Qualified lead",
  );
  await expect(defaults.getByRole("button", { name: "Discard", exact: true })).toBeVisible();
  await defaults.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(defaults.getByRole("combobox", { name: "Default currency" })).toHaveText("Not set");
  await expect(pipeline.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await pipeline.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(pipeline.getByRole("textbox", { name: "Stage 1 name" })).not.toHaveValue(
    "Qualified lead",
  );

  await defaults.getByRole("combobox", { name: "Default currency" }).click();
  await page.getByRole("option", { name: "USD", exact: true }).click();
  await pipeline.getByRole("textbox", { name: "Stage 1 name" }).fill("Qualified lead");
  await defaults.getByRole("button", { name: "Save", exact: true }).click();
  await expect(defaults.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(pipeline.getByRole("textbox", { name: "Stage 1 name" })).toHaveValue(
    "Qualified lead",
  );
  await expect(pipeline.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await pipeline.getByRole("button", { name: "Save", exact: true }).click();
  await expect(pipeline.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.reload();
  await expect(defaults.getByRole("combobox", { name: "Default currency" })).toHaveText("USD");
  await expect(pipeline.getByRole("textbox", { name: "Stage 1 name" })).toHaveValue(
    "Qualified lead",
  );

  await page.setViewportSize({ width: 800, height: 720 });
  await expect(pipeline.getByRole("textbox", { name: "Stage 1 name" })).toBeInViewport();
  await expect(defaults.getByRole("combobox", { name: "Default currency" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(800);
});
