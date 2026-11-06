import { expect, test } from "@playwright/test";

test("an empty workspace offers project creation, not an unavailable project", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--empty-workspace&viewMode=story");
  await expect(page.getByRole("heading", { name: "No projects yet", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Project unavailable", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toBeVisible();
});

test("project tabs support keyboard navigation and retain the task selection", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--project&viewMode=story");
  const task = page
    .getByRole("region", { name: "Project tasks", exact: true })
    .getByRole("button")
    .first();
  await task.click();
  await expect(task).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("tab", { name: "Tasks", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Project settings", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Project access", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(task).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Task details", exact: true })).toBeVisible();
});

test("task rows expose aligned metadata and use the full idle pane", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/iframe.html?id=projects-scenes-tasks--populated-workspace&viewMode=story");
  const list = page.getByRole("region", { name: "Project tasks", exact: true });
  await expect(list.getByText("Assignee", { exact: true })).toBeVisible();
  await expect(list.getByText("Priority", { exact: true })).toBeVisible();
  await expect(list.getByText("Due date", { exact: true })).toBeVisible();
  const bounds = await list.boundingBox();
  expect(bounds!.width).toBeGreaterThan(850);
  const rows = list.getByRole("button");
  const first = await rows.first().boundingBox();
  expect(first!.height).toBeLessThanOrEqual(48);
  await rows.first().click();
  await expect(rows.first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Task details", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

for (const width of [1024, 1280, 1440]) {
  test(`task detail and create panel are in the viewport at ${width}px and restore focus`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 768 });
    await page.goto("/iframe.html?id=projects-scenes-tasks--populated-workspace&viewMode=story");
    const row = page
      .getByRole("region", { name: "Project tasks", exact: true })
      .getByRole("button")
      .first();
    await row.click();
    await expect(page.getByRole("heading", { name: "Description", exact: true })).toBeInViewport();
    await expect(page.getByLabel("Selected task panel", { exact: true })).toBeFocused();
    const selectedColor = await row.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await page.getByRole("button", { name: "Close task", exact: true }).focus();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      selectedColor,
    );
    expect(selectedColor).not.toBe("rgba(0, 0, 0, 0)");
    await page.getByRole("button", { name: "Close task", exact: true }).click();
    await expect(row).toBeFocused();
    const create = page.getByRole("button", { name: "New task", exact: true });
    await create.click();
    await expect(page.getByLabel("Task title", { exact: true })).toBeInViewport();
    await expect(page.getByLabel("Task title", { exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(create).toBeFocused();
  });
}

test("pending forms lock draft controls while a save is in flight", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=projects-components-task-controls--pending-forms&viewMode=story",
  );
  for (const name of [
    "Task title",
    "Task description",
    "Project name",
    "Project description",
    "Due date",
    "Add a comment",
  ]) {
    await expect(page.getByLabel(name, { exact: true })).toBeDisabled();
  }
  for (const name of ["Status", "Priority", "Assignee", "Person or agent", "Permission"]) {
    await expect(page.getByRole("combobox", { name, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole("button", { name: "Saving task…", exact: true })).toBeDisabled();
});

test("task save failure retains the draft for retry", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-components-task-controls--save-failure&viewMode=story");
  await page.getByLabel("Task title", { exact: true }).fill("Keep this title");
  await page.getByLabel("Task description", { exact: true }).fill("Keep these details");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue("Keep this title");
  await expect(page.getByLabel("Task description", { exact: true })).toHaveValue(
    "Keep these details",
  );
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Task saved");
});

for (const kind of ["task", "project", "sharing"] as const) {
  test(`${kind} save locks its submitted draft and retains it after failure`, async ({ page }) => {
    await page.goto(
      `/iframe.html?id=projects-components-task-controls--${kind}-save-workflow&viewMode=story`,
    );
    const submit = page.getByRole("button", {
      name: { task: "Create task", project: "Create project", sharing: "Update access" }[kind],
      exact: true,
    });
    if (kind !== "sharing") {
      await expect(submit).toBeDisabled();
      const title = page.getByLabel(kind === "task" ? "Task title" : "Project name", {
        exact: true,
      });
      await title.fill("   ");
      await expect(submit).toBeDisabled();
      await title.fill("Draft to preserve");
      await page
        .getByLabel(kind === "task" ? "Task description" : "Project description", { exact: true })
        .fill("Description to preserve");
    } else {
      await page.getByRole("combobox", { name: "Person or agent", exact: true }).click();
      await page.getByRole("option", { name: "Release assistant (agent)", exact: true }).click();
      await page.getByRole("combobox", { name: "Permission", exact: true }).click();
      await page.getByRole("option", { name: "Comment", exact: true }).click();
    }
    await submit.click();
    if (kind === "sharing")
      await page.getByRole("button", { name: "Confirm access", exact: true }).click();
    const draftControl =
      kind === "sharing"
        ? page.getByRole("combobox", { name: "Permission", exact: true })
        : page.getByLabel(kind === "task" ? "Task title" : "Project name", {
            exact: true,
          });
    await expect(draftControl).toBeDisabled();
    await page.getByRole("button", { name: "Fail save", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(draftControl).toBeEnabled();
    if (kind === "sharing") await expect(submit).toBeFocused();
    if (kind === "sharing") {
      await expect(draftControl).toHaveText("Comment");
      await expect(page.getByRole("combobox", { name: "Person or agent", exact: true })).toHaveText(
        "Release assistant (agent)",
      );
    } else {
      await expect(draftControl).toHaveValue("Draft to preserve");
      await expect(
        page.getByLabel(kind === "task" ? "Task description" : "Project description", {
          exact: true,
        }),
      ).toHaveValue("Description to preserve");
    }
    await submit.click();
    if (kind === "sharing")
      await page.getByRole("button", { name: "Confirm access", exact: true }).click();
    await page.getByRole("button", { name: "Complete save", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Changes saved");
    await expect(page.getByRole("alert")).toHaveCount(0);
    if (kind === "sharing") await expect(submit).toBeFocused();
  });
}

test("empty projects keep the next action and do not claim access loss", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--empty-project&viewMode=story");
  await expect(page.getByRole("heading", { name: "No tasks yet", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Project unavailable", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await expect(page.getByLabel("Task title", { exact: true })).toBeInViewport();
});

test("canceling a new task restores the create trigger even when a task remains selected", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--project&viewMode=story");
  await page
    .getByRole("region", { name: "Project tasks", exact: true })
    .getByRole("button")
    .first()
    .click();
  const create = page.getByRole("button", { name: "New task", exact: true });
  await create.click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("region", { name: "Task details", exact: true })).toBeVisible();
  await expect(create).toBeFocused();
});
