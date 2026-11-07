import { test } from "../test-support/fixture.js";
import { failRequestsAt } from "../test-support/request-failure.js";
import { expect } from "@playwright/test";

test("project refresh toasts preserve content, retry, and stay dismissed during an outage", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: "Tasks", exact: true })
    .click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Refresh feedback project");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  const heading = page.getByRole("heading", { name: "Refresh feedback project", exact: true });
  await expect(heading).toBeVisible();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const description = page.getByLabel("Project description", { exact: true });
  await description.fill("Keep this unsaved edit");

  const failure = await page.evaluateHandle(failRequestsAt, "/api/v1/tasks/project");
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Couldn’t refresh project" });
  const stale = page.getByText("Project may be out of date.", { exact: true });
  await expect(toast).toBeVisible();
  await expect(heading).toBeVisible();
  await expect(description).toHaveValue("Keep this unsaved edit");
  await expect(stale).toBeVisible();
  await expect(page.getByText("Internal connection details", { exact: true })).toHaveCount(0);
  await failure.evaluate((control) => control.recover());
  await toast.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(stale).toHaveCount(0);
  await expect(description).toHaveValue("Keep this unsaved edit");

  await failure.evaluate((control) => control.fail());
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Close toast", exact: true }).click();
  await expect(toast).toHaveCount(0);
  const previousFailures = await failure.evaluate((control) => control.failures());
  await expect
    .poll(() => failure.evaluate((control) => control.failures()), { timeout: 20_000 })
    .toBeGreaterThan(previousFailures);
  await expect(toast).toHaveCount(0);
  await expect(stale).toBeVisible();
  await expect(description).toHaveValue("Keep this unsaved edit");
  await failure.evaluate((control) => control.recover());
  await expect(stale).toHaveCount(0);
});
