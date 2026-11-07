import { test } from "../test-support/fixture.js";
import { reconnectRealtime } from "../test-support/realtime.js";
import { failRequestsAt } from "../test-support/request-failure.js";
import { expect } from "@playwright/test";

test("an empty loaded workspace uses refresh toasts but initial failures stay in place", async ({
  desktop,
}) => {
  await desktop.provision();
  const page = desktop.page;
  const empty = page.getByText("Your conversations start here", { exact: true });
  await expect(empty).toBeVisible();
  const failure = await page.evaluateHandle(failRequestsAt, "/api/v1/messaging/conversations");
  await reconnectRealtime(page);
  const toast = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Couldn’t refresh conversations" });
  await expect(toast).toBeVisible();
  await expect(empty).toBeVisible();
  await expect(page.getByText("Couldn’t load conversations", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Workspace unavailable", { exact: true })).toHaveCount(0);
  await failure.evaluate((control) => control.recover());
  await toast.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Conversations may be out of date.", { exact: true })).toHaveCount(0);
  await page.addInitScript(failRequestsAt, "/api/v1/messaging/conversations");
  await page.reload();
  await expect(page.getByText("Workspace unavailable", { exact: true })).toBeVisible();
  await expect(toast).toHaveCount(0);
  await expect(empty).toHaveCount(0);
});
