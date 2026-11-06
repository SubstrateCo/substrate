import { expect, test } from "@playwright/test";

test("workspace loading does not claim there are no projects or tasks", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--loading-projects&viewMode=story");
  await expect(page.getByRole("status", { name: "Loading projects", exact: true })).toBeVisible();
  await expect(
    page.getByText("No projects yet. Create a project to start planning.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No tasks yet", exact: true })).toHaveCount(0);
});

for (const state of ["projects-error", "unavailable-workspace"]) {
  test(`${state} retries without exposing inaccessible project content`, async ({ page }) => {
    await page.goto(`/iframe.html?id=projects-scenes-tasks--${state}&viewMode=story`);
    const unavailable = state === "unavailable-workspace";
    await expect(
      page.getByRole("heading", {
        name: unavailable ? "Projects unavailable" : "Couldn’t load projects",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("No projects yet. Create a project to start planning.", { exact: true }),
    ).toHaveCount(0);
    if (unavailable) {
      await expect(page.getByRole("button", { name: "Product launch", exact: true })).toHaveCount(
        0,
      );
      await expect(page.getByRole("button", { name: /Ship the launch/ })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Product launch", exact: true })).toHaveCount(
        0,
      );
    }
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("button", { name: /Ship the launch/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
  });
}

test("project access recovery reveals tasks only after retry", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--unavailable-project&viewMode=story");
  await expect(
    page.getByRole("heading", { name: "Project unavailable", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "New task", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ship the launch/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("button", { name: /Ship the launch/ }).click();
  await expect(page.getByRole("region", { name: "Task details", exact: true })).toBeVisible();
});

test("view-only project settings expose no mutation controls", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--view-only&viewMode=story");
  await page.getByRole("button", { name: "Project settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Project access", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workflow statuses", exact: true })).toBeVisible();
  for (const name of ["Edit project", "Update access", "Remove Alex Morgan", "Add status"]) {
    await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  }
  await expect(page.getByRole("textbox", { name: "New status name", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to tasks", exact: true }).click();
  await page.getByRole("button", { name: /Ship the launch/ }).click();
  await expect(page.getByRole("button", { name: "Add subtask", exact: true })).toHaveCount(0);
});

test("a failed comment does not appear as a failure on a different task", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--comment-error&viewMode=story");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Task title", exact: true })
    .fill("Independent recovery task");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Independent recovery task", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Ship the launch/ }).click();
  await page
    .getByRole("textbox", { name: "Add a comment", exact: true })
    .fill("Keep this failed draft");
  await page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Add a comment", exact: true })).toHaveValue(
    "Keep this failed draft",
  );
  await page.getByRole("button", { name: /Independent recovery task/ }).click();
  await expect(
    page.getByRole("heading", { name: "Independent recovery task", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Task comments", exact: true }).getByRole("alert"),
  ).toHaveCount(0);
});
