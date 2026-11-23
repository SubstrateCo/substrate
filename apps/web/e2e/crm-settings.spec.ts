import { visit } from "./test-support/fixtures";
import { test } from "./test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test("CRM settings use a centered settings column and grouped save footers", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  await page.setViewportSize({ width: 1920, height: 1080 });
  await visit(user, undefined, "/crm", { section: "settings" });
  const defaults = page.getByRole("region", { name: "Deal defaults", exact: true });
  const currency = defaults.getByRole("combobox", { name: "Default currency" });
  await expect(currency).toBeVisible();
  const column = page.locator('[data-slot="settings-content"]');
  const columnBox = await column.boundingBox();
  const frameBox = await column.locator("..").boundingBox();
  expect(columnBox!.width).toBeCloseTo(896, 0);
  expect(columnBox!.x - frameBox!.x).toBeCloseTo(
    frameBox!.x + frameBox!.width - columnBox!.x - columnBox!.width,
    0,
  );

  const card = defaults.getByRole("region", { name: "CRM defaults", exact: true });
  const save = card.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeDisabled();
  const cardBox = await card.boundingBox();
  const currencyBox = await currency.boundingBox();
  const saveBox = await save.boundingBox();
  expect(currencyBox!.x - cardBox!.x).toBeCloseTo(21, 0);
  expect(cardBox!.x + cardBox!.width - saveBox!.x - saveBox!.width).toBeCloseTo(21, 0);
  expect(saveBox!.y).toBeGreaterThan(currencyBox!.y + currencyBox!.height);

  const pipeline = page.getByRole("region", { name: "Pipeline", exact: true });
  const pipelineCard = pipeline.getByRole("region", { name: "CRM pipeline", exact: true });
  const pipelineSave = pipelineCard.getByRole("button", { name: "Save", exact: true });
  await expect(pipelineSave).toBeDisabled();
  const pipelineCardBox = await pipelineCard.boundingBox();
  const stagesBox = await pipelineCard.getByRole("list").boundingBox();
  const addStageBox = await pipelineCard.getByRole("button", { name: "Add stage" }).boundingBox();
  const pipelineSaveBox = await pipelineSave.boundingBox();
  expect(pipelineCardBox!.x).toBe(cardBox!.x);
  expect(stagesBox!.x).toBe(currencyBox!.x);
  expect(
    pipelineCardBox!.x + pipelineCardBox!.width - pipelineSaveBox!.x - pipelineSaveBox!.width,
  ).toBeCloseTo(21, 0);
  expect(pipelineSaveBox!.y).toBeGreaterThan(addStageBox!.y + addStageBox!.height);
});

test("CRM settings show aligned, compact sections with reachable save actions", async ({
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
  // The sections stack, so the content pane scrolls to reach each section's save action.
  for (const section of [pipeline, defaults]) {
    const save = section.getByRole("button", { name: "Save", exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
  }
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
  const defaultsCardBox = await defaults
    .getByRole("region", { name: "CRM defaults", exact: true })
    .boundingBox();
  const pipelineCardBox = await pipeline
    .getByRole("region", { name: "CRM pipeline", exact: true })
    .boundingBox();
  expect(defaultsCardBox!.x).toBe(pipelineCardBox!.x);
  expect(currencyBox!.x).toBe(stagesBox!.x);
  expect(currencyBox!.x).toBeGreaterThan(defaultsCardBox!.x);

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
