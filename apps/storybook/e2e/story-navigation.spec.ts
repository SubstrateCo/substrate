import { expect, test } from "@playwright/test";
import { openStory } from "./stories";

test("feature sections separate components from full scenes", async ({ page }) => {
  await page.goto("/?path=/story/messaging-components-composer--empty");
  const navigation = page.getByRole("navigation", { name: "Stories" });
  await expect(navigation.getByText("Messaging", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Projects", { exact: true })).toBeVisible();
  await expect(navigation.getByText("Primitives", { exact: true })).toBeVisible();
  const preview = page.frameLocator("#storybook-preview-iframe");
  await expect(preview.getByRole("textbox", { name: "Message #general" })).toBeVisible();
  await page.goto("/?path=/story/projects-components-connected-task--source");
  await expect(preview.getByLabel("Task title", { exact: true })).toBeVisible();
});

test("preview navigation renders the next story without reloading the document", async ({
  page,
}) => {
  await openStory(page, "primitives-actions-button--default");
  const initialDocument = await page.evaluate(() => performance.timeOrigin);
  await openStory(page, "primitives-actions-button--secondary");
  await openStory(page, "primitives-actions-button--sizes");
  await expect(page.getByRole("button", { name: "sm", exact: true })).toBeVisible();
  await openStory(page, "primitives-actions-button--default");
  await expect(page.getByRole("button", { name: "Button", exact: true })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialDocument);
});

test("linked work opens the destination preview", async ({ page }) => {
  await openStory(page, "messaging-scenes-workspace--task-in-channel");
  await page.getByRole("link", { name: "Open Review the onboarding flow", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Product launch", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ship the launch/ })).toBeVisible();
});

test("inline references open the destination preview", async ({ page }) => {
  await openStory(page, "messaging-components-references-inline-reference--task");
  await page.getByRole("link", { name: "Review the onboarding flow", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Product launch", exact: true })).toBeVisible();
});
