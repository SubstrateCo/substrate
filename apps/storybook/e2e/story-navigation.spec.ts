import { expect, test } from "@playwright/test";
import { openStory } from "./stories";

test("preview navigation renders the next story without reloading the document", async ({
  page,
}) => {
  await openStory(page, "components-button--default");
  const initialDocument = await page.evaluate(() => performance.timeOrigin);
  await openStory(page, "components-button--secondary");
  await openStory(page, "components-button--sizes");
  await expect(page.getByRole("button", { name: "sm", exact: true })).toBeVisible();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(initialDocument);
});
