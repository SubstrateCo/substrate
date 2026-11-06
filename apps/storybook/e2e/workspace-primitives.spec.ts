import { expect, test } from "@playwright/test";

test("dialogs have a visible close action and restore focus to the trigger", async ({ page }) => {
  await page.goto("/iframe.html?id=primitives-workspace-patterns--modal&viewMode=story");
  const trigger = page.getByRole("button", { name: "Open dialog" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Project details" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
