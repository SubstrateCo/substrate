import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { provisionVerifiedAccount } from "./auth";
import { Mailpit } from "./mailpit";
import { provisionWorkspace } from "./organizations";

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("project and task edits, cleared fields, nested subtasks, and comments survive reload and app switching", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const account = {
    name: `Editor ${suffix}`,
    email: `task-editor-${suffix}@example.test`,
    password: `Tasks-${randomUUID()}!`,
  };
  await provisionVerifiedAccount(page, new Mailpit(request), account);
  await provisionWorkspace(page, `Editing ${suffix}`, `editing-${suffix}`);
  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await apps.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Original project");
  await page.getByLabel("Project description", { exact: true }).fill("Original description");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Original project", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Project settings", exact: true }).click();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue("Original project");
  await expect(page.getByLabel("Project description", { exact: true })).toHaveValue(
    "Original description",
  );
  await page.getByLabel("Project name", { exact: true }).fill("Edited project");
  await page.getByLabel("Project description", { exact: true }).fill("Edited project description");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edited project", exact: true })).toBeVisible();
  await expect(page.getByText("Edited project description", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill("Original task");
  await page.getByLabel("Task description", { exact: true }).fill("Original task description");
  await choose(page, "Status", "In progress");
  await choose(page, "Priority", "Urgent");
  await choose(page, "Assignee", account.name);
  await page.getByLabel("Due date", { exact: true }).fill("2026-12-15");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const details = page.getByRole("region", { name: "Task details", exact: true });
  for (const value of ["In progress", "urgent", account.name, "2026-12-15"]) {
    await expect(details.getByRole("definition").filter({ hasText: value })).toBeVisible();
  }
  await details.getByRole("button", { name: "Edit task", exact: true }).click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue("Original task");
  await expect(page.getByLabel("Task description", { exact: true })).toHaveValue(
    "Original task description",
  );
  await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-15");
  await expect(page.getByRole("combobox", { name: "Assignee", exact: true })).toContainText(
    account.name,
  );
  await page.getByLabel("Task title", { exact: true }).fill("Edited parent task");
  await page.getByLabel("Task description", { exact: true }).fill("Edited task description");
  await choose(page, "Status", "Done");
  await choose(page, "Priority", "Low");
  await choose(page, "Assignee", "Unassigned");
  await page.getByLabel("Due date", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(
    details.getByRole("heading", { name: "Edited parent task", exact: true }),
  ).toBeVisible();
  await expect(details.getByText("Edited task description", { exact: true })).toBeVisible();
  for (const value of ["Done", "low", "Unassigned", "No due date"]) {
    await expect(
      details.getByRole("definition").filter({ hasText: new RegExp(`^${value}$`) }),
    ).toBeVisible();
  }
  await details.getByLabel("Add a comment", { exact: true }).fill("Parent comment persists.");
  await details.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(details.getByText("Parent comment persists.", { exact: true })).toBeVisible();
  for (const [title, parent] of [
    ["Child task", "Edited parent task"],
    ["Grandchild task", "Child task"],
  ] as const) {
    await details.getByRole("button", { name: "Add subtask", exact: true }).click();
    await page.getByLabel("Task title", { exact: true }).fill(title);
    await page.getByRole("button", { name: "Create subtask", exact: true }).click();
    await expect(details.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText(`Subtask of ${parent}`, { exact: true })).toBeVisible();
  }
  await details.getByLabel("Add a comment", { exact: true }).fill("Grandchild comment persists.");
  await details.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(details.getByText("Grandchild comment persists.", { exact: true })).toBeVisible();
  await expect(details.getByText("Parent comment persists.", { exact: true })).toBeHidden();
  const projectUrl = page.url();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Edited project", exact: true })).toBeVisible();
  await expect(page.getByText("Edited project description", { exact: true })).toBeVisible();
  const tasks = page.getByRole("region", { name: "Project tasks", exact: true });
  await tasks.getByRole("button", { name: /^Edited parent task/ }).click();
  await expect(details.getByText("Edited task description", { exact: true })).toBeVisible();
  await expect(details.getByText("Parent comment persists.", { exact: true })).toBeVisible();
  await expect(details.getByText("Grandchild comment persists.", { exact: true })).toBeHidden();
  for (const value of ["Done", "low", "Unassigned", "No due date"]) {
    await expect(
      details.getByRole("definition").filter({ hasText: new RegExp(`^${value}$`) }),
    ).toBeVisible();
  }
  await details.getByRole("button", { name: "Edit task", exact: true }).click();
  await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Assignee", exact: true })).toContainText(
    "Unassigned",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await tasks.getByRole("button", { name: /^Grandchild task/ }).click();
  await expect(details.getByText("Grandchild comment persists.", { exact: true })).toBeVisible();
  await expect(tasks.getByText("Subtask of Child task", { exact: true })).toBeVisible();
  await apps.getByRole("button", { name: "Messages", exact: true }).click();
  await expect(page).not.toHaveURL(projectUrl);
  await apps.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: /Edited project/ }).click();
  await expect(page).toHaveURL(projectUrl);
  await page
    .getByRole("region", { name: "Project tasks", exact: true })
    .getByRole("button", { name: /^Grandchild task/ })
    .click();
  await expect(
    details.getByRole("heading", { name: "Grandchild task", exact: true }),
  ).toBeVisible();
  await expect(details.getByText("Grandchild comment persists.", { exact: true })).toBeVisible();
});
