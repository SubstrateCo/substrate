import { expect, test, type Page } from "@playwright/test";

async function expectWorkspaceFits(page: Page) {
  const workspace = page.getByRole("region", { name: "Tasks application", exact: true });
  const size = await workspace.evaluate((element) => ({
    content: element.scrollWidth,
    available: element.clientWidth,
  }));
  expect
    .soft(size.content, "Task workspace must not require horizontal scrolling")
    .toBeLessThanOrEqual(size.available);
}

test("keyboard task creation rejects blank titles and saves selected priority once", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=scenes-tasks--project&viewMode=story");
  const newTask = page.getByRole("button", { name: "New task", exact: true });
  await newTask.focus();
  await page.keyboard.press("Enter");
  const title = page.getByLabel("Task title", { exact: true });
  const create = page.getByRole("button", { name: "Create task", exact: true });
  await expect(create).toBeDisabled();
  await title.fill("   ");
  await title.press("Enter");
  await expect(create).toBeDisabled();
  await expect(page.getByRole("region", { name: "Task details", exact: true })).toHaveCount(0);
  await title.fill("Keyboard-only task");
  await title.press("Tab");
  await expect(page.getByLabel("Task description", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  const priority = page.getByRole("combobox", { name: "Priority", exact: true });
  await expect(priority).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: "Urgent", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(priority).toContainText("Urgent");
  await title.focus();
  await title.press("Enter");
  const details = page.getByRole("region", { name: "Task details", exact: true });
  await expect(
    details.getByRole("heading", { name: "Keyboard-only task", exact: true }),
  ).toBeVisible();
  await expect(details.getByRole("definition").filter({ hasText: /^urgent$/ })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Project tasks", exact: true })
      .getByRole("button", { name: /Keyboard-only task/ }),
  ).toHaveCount(1);
});

test("rapid create and comment activation does not duplicate content", async ({ page }) => {
  await page.goto("/iframe.html?id=scenes-tasks--project&viewMode=story");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill("One rapid task");
  await page.getByRole("button", { name: "Create task", exact: true }).dblclick();
  await expect(
    page
      .getByRole("region", { name: "Project tasks", exact: true })
      .getByRole("button", { name: /One rapid task/ }),
  ).toHaveCount(1);
  await page.getByLabel("Add a comment", { exact: true }).fill("One rapid comment");
  await page.getByRole("button", { name: "Post comment", exact: true }).dblclick();
  await expect(page.getByText("One rapid comment", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Add a comment", { exact: true })).toHaveValue("");
});

for (const theme of ["light", "dark"] as const) {
  test(`long project, task, and comment content stays contained in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/iframe.html?id=scenes-tasks--${theme === "dark" ? "dark-project" : "project"}&viewMode=story`,
    );
    const projectName = "Project" + "P".repeat(190);
    const taskTitle = "Task" + "T".repeat(290);
    const description = "Description" + "D".repeat(1000);
    const comment = "Comment" + "C".repeat(2000);
    await page.getByRole("button", { name: "Project settings", exact: true }).click();
    await page.getByRole("button", { name: "Edit project", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill(projectName);
    await page.getByLabel("Project description", { exact: true }).fill(description);
    await page.getByRole("button", { name: "Save project", exact: true }).click();
    await expect(page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();
    await expectWorkspaceFits(page);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.getByLabel("Task title", { exact: true }).fill(taskTitle);
    await page.getByLabel("Task description", { exact: true }).fill(description);
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    await expectWorkspaceFits(page);
    await page.getByLabel("Add a comment", { exact: true }).fill(comment);
    await page.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(page.getByText(comment, { exact: true })).toBeVisible();
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectWorkspaceFits(page);
      const details = page.getByRole("region", { name: "Task details", exact: true });
      const size = await details.evaluate((element) => ({
        content: element.scrollWidth,
        available: element.clientWidth,
      }));
      expect
        .soft(size.content, `Task details overflow at ${width}px`)
        .toBeLessThanOrEqual(size.available);
    }
  });

  test(`long custom status stays contained in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/iframe.html?id=scenes-tasks--${theme === "dark" ? "dark-project" : "project"}&viewMode=story`,
    );
    const statusName = "Review" + "R".repeat(94);
    await page.getByRole("button", { name: "Project settings", exact: true }).click();
    await page.getByLabel("New status name", { exact: true }).fill(statusName);
    await page.getByRole("button", { name: "Add status", exact: true }).click();
    await expect(
      page
        .getByRole("region", { name: "Project statuses", exact: true })
        .getByText(statusName, { exact: false }),
    ).toBeVisible();
    await expectWorkspaceFits(page);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.getByLabel("Task title", { exact: true }).fill("Task with long workflow status");
    await page.getByRole("combobox", { name: "Status", exact: true }).click();
    await page.getByRole("option", { name: statusName, exact: true }).click();
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    await expect(page.getByRole("region", { name: "Task details", exact: true })).toBeVisible();
    await expectWorkspaceFits(page);
  });
}
