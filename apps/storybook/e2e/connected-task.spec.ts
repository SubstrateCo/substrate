import { expect, test } from "@playwright/test";

test("source text is copied only by an explicit action, and failure preserves editable input", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=projects-components-connected-task--failed&viewMode=story");
  const description = page.getByLabel("Task description", { exact: true });
  await expect(description).toHaveValue("");
  await page
    .getByRole("button", { name: "Copy source text into description", exact: true })
    .click();
  await expect(description).toHaveValue("Customer asked for a launch checklist.");
  await description.fill("Keep my edited description.");
  await page.getByLabel("Task title", { exact: true }).fill("Prepare checklist");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(description).toHaveValue("Keep my edited description.");
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue("Prepare checklist");
});

test("pending source creation cannot be submitted twice", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-components-connected-task--saving&viewMode=story");
  await page.getByLabel("Task title", { exact: true }).fill("Checklist");
  await expect(page.getByRole("button", { name: /Saving task…$/ })).toBeDisabled();
});
