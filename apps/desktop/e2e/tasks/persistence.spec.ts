import { test } from "../test-support/fixture.js";
import { waitForRealtimeIdle } from "../test-support/realtime.js";
import { callTasks } from "../test-support/tasks.js";
import { expect, type Page } from "@playwright/test";

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

for (const leaveProject of [false, true])
  test(
    leaveProject
      ? "task creation does not reopen a project left during its access reset"
      : "task creation finishes after its access echo remounts the form",
    async ({ desktop }) => {
      await desktop.provision();
      const { page } = desktop;
      const project = await callTasks<{ id: string }>(page, {
        action: "createProject",
        name: "Access echo project",
      });
      await desktop.openPath(`/tasks?projectId=${project.id}`);
      await waitForRealtimeIdle(page);
      await page.getByRole("button", { name: "New task", exact: true }).click();
      const form = page.getByRole("form", { name: "New task", exact: true });
      await form.getByLabel("Task title", { exact: true }).fill("Created during access reset");
      const originalForm = await form.elementHandle();
      const response = await page.evaluateHandle(() => {
        const original = window.fetch;
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        let captured = false;
        window.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
          const [input, init] = args;
          const url = new URL(input instanceof Request ? input.url : String(input), location.href);
          let action: string | undefined;
          if (url.pathname === "/api/v1/tasks/mutations") {
            const request = input instanceof Request ? input.clone() : new Request(url, init);
            action = (await request.json()).action;
          }
          const result = await original(...args);
          if (action === "createTask") {
            captured = true;
            await gate;
          }
          return result;
        }, original);
        return {
          captured: () => captured,
          release,
          restore: () => {
            window.fetch = original;
            release();
          },
        };
      });
      try {
        await form.getByRole("button", { name: "Create task", exact: true }).click();
        await expect.poll(() => response.evaluate((control) => control.captured())).toBe(true);
        await expect
          .poll(() => originalForm.evaluate((element) => !element.isConnected))
          .toBe(true);
        if (leaveProject) {
          await page
            .getByRole("dialog", { name: "New task", exact: true })
            .getByRole("button", { name: "Cancel", exact: true })
            .click();
          await page
            .getByRole("navigation", { name: "Apps", exact: true })
            .getByRole("button", { name: "Messages", exact: true })
            .click();
          await expect(page).toHaveURL(/\/dashboard/);
        }
        const destination = page.url();
        await response.evaluate((control) => control.release());
        await waitForRealtimeIdle(page);
        await expect(page.getByRole("dialog", { name: "New task", exact: true })).toHaveCount(0);
        if (leaveProject) await expect(page).toHaveURL(destination);
        else
          await expect(
            page
              .getByRole("region", { name: "Task details", exact: true })
              .getByRole("heading", { name: "Created during access reset", exact: true }),
          ).toBeVisible();
      } finally {
        await response.evaluate((control) => control.restore());
        await response.dispose();
        await originalForm.dispose();
      }
    },
  );

test("project and task edits, cleared fields, nested subtasks, and comments survive reload and app switching", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page, owner: account } = desktop;
  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await apps.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Original project");
  await page.getByLabel("Project description", { exact: true }).fill("Original description");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Original project", exact: true })).toBeVisible();
  await waitForRealtimeIdle(page);
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Project name", { exact: true })).toHaveValue("Original project");
  await expect(page.getByLabel("Project description", { exact: true })).toHaveValue(
    "Original description",
  );
  await page.getByLabel("Project name", { exact: true }).fill("Edited project");
  await page.getByLabel("Project description", { exact: true }).fill("Edited project description");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edited project", exact: true })).toBeVisible();
  await expect(page.getByTitle("Edited project description", { exact: true })).toBeVisible();
  await waitForRealtimeIdle(page);

  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill("Original task");
  await page.getByLabel("Task description", { exact: true }).fill("Original task description");
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await expect(page.getByRole("option")).toHaveText([
    "Not Started",
    "In Progress",
    "In Review",
    "Completed",
    "Canceled",
  ]);
  await page.keyboard.press("Escape");
  await choose(page, "Status", "In Progress");
  await choose(page, "Priority", "Urgent");
  await choose(page, "Assignee", account.name);
  await page.getByLabel("Due date", { exact: true }).fill("2026-12-15");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const details = page.getByRole("region", { name: "Task details", exact: true });
  for (const value of ["In Progress", "urgent", account.name, "2026-12-15"]) {
    await expect(details.getByRole("definition").filter({ hasText: value })).toBeVisible();
  }
  await waitForRealtimeIdle(page);
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
  await choose(page, "Status", "Completed");
  await choose(page, "Priority", "Low");
  await choose(page, "Assignee", "Unassigned");
  await page.getByLabel("Due date", { exact: true }).fill("");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(
    details.getByRole("heading", { name: "Edited parent task", exact: true }),
  ).toBeVisible();
  await expect(details.getByText("Edited task description", { exact: true })).toBeVisible();
  for (const value of ["Completed", "low", "Unassigned", "No due date"]) {
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
    await waitForRealtimeIdle(page);
    await details.getByRole("button", { name: "Add subtask", exact: true }).click();
    await page.getByLabel("Task title", { exact: true }).fill(title);
    await page.getByRole("button", { name: "Create subtask", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "New subtask", exact: true })).toBeHidden();
    await expect(details.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText(`Subtask of ${parent}`, { exact: true })).toBeVisible();
    await waitForRealtimeIdle(page);
  }
  await details.getByLabel("Add a comment", { exact: true }).fill("Grandchild comment persists.");
  await details.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(details.getByText("Grandchild comment persists.", { exact: true })).toBeVisible();
  await expect(details.getByText("Parent comment persists.", { exact: true })).toBeHidden();
  const taskUrl = page.url();
  const projectUrl = new URL(taskUrl);
  projectUrl.searchParams.delete("taskId");
  await page.reload();
  await expect(page).toHaveURL(taskUrl);
  await expect(
    details.getByRole("heading", { name: "Grandchild task", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Edited project", exact: true })).toBeVisible();
  await expect(page.getByTitle("Edited project description", { exact: true })).toBeVisible();
  const tasks = page.getByRole("region", { name: "Project tasks", exact: true });
  await tasks
    .getByRole("button")
    .filter({ has: page.getByText("Edited parent task", { exact: true }) })
    .click();
  await expect(details.getByText("Edited task description", { exact: true })).toBeVisible();
  await expect(details.getByText("Parent comment persists.", { exact: true })).toBeVisible();
  await expect(details.getByText("Grandchild comment persists.", { exact: true })).toBeHidden();
  for (const value of ["Completed", "low", "Unassigned", "No due date"]) {
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
  await tasks
    .getByRole("button")
    .filter({ has: page.getByText("Grandchild task", { exact: true }) })
    .click();
  await expect(details.getByText("Grandchild comment persists.", { exact: true })).toBeVisible();
  await expect(tasks.getByText("Subtask of Child task", { exact: true })).toBeVisible();
  await apps.getByRole("button", { name: "Messages", exact: true }).click();
  await expect(page).not.toHaveURL(taskUrl);
  await apps.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: /Edited project/ }).click();
  await expect(page).toHaveURL(projectUrl.href);
  await page
    .getByRole("region", { name: "Project tasks", exact: true })
    .getByRole("button")
    .filter({ has: page.getByText("Grandchild task", { exact: true }) })
    .click();
  await expect(
    details.getByRole("heading", { name: "Grandchild task", exact: true }),
  ).toBeVisible();
  await expect(details.getByText("Grandchild comment persists.", { exact: true })).toBeVisible();
});
