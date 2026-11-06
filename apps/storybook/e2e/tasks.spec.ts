import { expect, test } from "@playwright/test";

test("tasks use five standard statuses for creation, grouping, and editing", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--project&viewMode=story");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const form = page.getByRole("form", { name: "New task", exact: true });
  await expect(form.getByRole("combobox", { name: "Status", exact: true })).toHaveText(
    "Not Started",
  );
  await form.getByRole("combobox", { name: "Status", exact: true }).click();
  await expect(page.getByRole("option")).toHaveText([
    "Not Started",
    "In Progress",
    "In Review",
    "Completed",
    "Canceled",
  ]);
  await page.getByRole("option", { name: "In Review", exact: true }).click();
  await form.getByLabel("Task title", { exact: true }).fill("Review the release");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  const details = page.getByRole("region", { name: "Task details", exact: true });
  await expect(details.getByText("In Review", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Project tasks", exact: true })
      .getByRole("heading", { name: "In Review 1", exact: true }),
  ).toBeVisible();
  await details.getByRole("button", { name: "Edit task", exact: true }).click();
  await details.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Completed", exact: true }).click();
  await details.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(details.getByText("Completed", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Project tasks", exact: true })
      .getByRole("heading", { name: "Completed 1", exact: true }),
  ).toBeVisible();
});

test("task UI runs without app services and keeps comment drafts after failure", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--comment-error&viewMode=story");
  await page.getByRole("button", { name: /Ship the launch/ }).click();
  const draft = page.getByLabel("Add a comment", { exact: true });
  await draft.fill("Ready for review");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(draft).toHaveValue("Ready for review");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Ready for review", { exact: true })).toBeVisible();
  await expect(draft).toHaveValue("");
});

test("task loading, error, access loss, and view-only states stay distinct", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--loading-project&viewMode=story");
  await expect(page.getByRole("status", { name: "Loading project", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No tasks yet" })).toHaveCount(0);
  await page.goto("/iframe.html?id=projects-scenes-tasks--project-error&viewMode=story");
  await expect(page.getByRole("heading", { name: "Couldn’t load project" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: /Ship the launch/ })).toBeVisible();
  await page.goto("/iframe.html?id=projects-scenes-tasks--unavailable-project&viewMode=story");
  await expect(page.getByRole("heading", { name: "Project unavailable" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ship the launch/ })).toHaveCount(0);
  await page.goto("/iframe.html?id=projects-scenes-tasks--view-only&viewMode=story");
  await expect(page.getByRole("button", { name: "New task", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /Ship the launch/ }).click();
  await expect(page.getByRole("button", { name: "Edit task", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Add a comment", exact: true })).toHaveCount(0);
});

test("task UI fits a narrow viewport in the dark theme", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/iframe.html?id=projects-scenes-tasks--dark-project&viewMode=story");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await expect(page.getByLabel("Task title", { exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
});
