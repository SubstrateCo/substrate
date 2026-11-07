import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("Electron task creation explains invalid titles and saves a corrected title", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  await desktop.openPath("/tasks");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Title validation");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Title validation", exact: true })).toBeVisible();
  const tasks = page.getByRole("region", { name: "Project tasks", exact: true });
  await expect(tasks.getByText("No tasks yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const form = page.getByRole("form", { name: "New task", exact: true });
  const title = form.getByLabel("Task title", { exact: true });
  const error = form.getByRole("alert").filter({ hasText: /title/i });
  const submit = form.getByRole("button", { name: "Create task", exact: true });

  await submit.click();
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(error).toBeVisible();
  await expect(error).toContainText(/required|enter|provide|empty|blank/i);

  await title.fill("Draft checklist");
  await title.blur();
  await expect(error).toBeHidden();
  await title.fill("   ");
  await title.blur();
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(error).toBeVisible();
  await submit.click();
  await expect(form).toBeVisible();
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(error).toContainText(/required|enter|provide|empty|blank/i);
  const errorId = await error.getAttribute("id");
  expect(errorId, "The inline error has an accessible description target").toBeTruthy();
  expect((await title.getAttribute("aria-describedby"))?.split(/\s+/)).toContain(errorId);
  await expect(title).toHaveAccessibleDescription(/title/i);
  const controlBox = await title.boundingBox();
  const errorBox = await error.boundingBox();
  expect(controlBox).not.toBeNull();
  expect(errorBox).not.toBeNull();
  expect(errorBox!.y, "The readable title error is below its control").toBeGreaterThanOrEqual(
    controlBox!.y + controlBox!.height,
  );
  await expect(tasks.getByRole("listitem")).toHaveCount(0);

  await title.fill("Prepare launch checklist");
  await title.blur();
  await expect(error).toBeHidden();
  await expect(title).not.toHaveAttribute("aria-invalid", "true");
  await submit.click();
  await expect(form).toBeHidden();
  await page.reload();
  await expect(tasks.getByRole("button", { name: /Prepare launch checklist/ })).toBeVisible();
  await expect(tasks.getByRole("listitem")).toHaveCount(1);
});
