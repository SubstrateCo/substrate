import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { provisionVerifiedAccount } from "./auth";
import { Mailpit } from "./mailpit";
import { provisionWorkspace } from "./organizations";

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("tasks application creates projects, standard-status assigned tasks, subtasks, and comments", async ({
  page,
  request,
}) => {
  const suffix = randomUUID().slice(0, 8);
  const account = {
    name: `Planner ${suffix}`,
    email: `planner-${suffix}@example.test`,
    password: `Tasks-${randomUUID()}!`,
  };
  await provisionVerifiedAccount(page, new Mailpit(request), account);
  await provisionWorkspace(page, `Tasks ${suffix}`, `tasks-${suffix}`);
  await page
    .getByRole("navigation", { name: "Apps" })
    .getByRole("button", { name: "Tasks", exact: true })
    .click();
  await expect(page).toHaveURL(/\/tasks\/?$/);
  await expect(page.getByRole("heading", { name: "Your team's work, in one place" })).toBeVisible();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Product launch");
  await page
    .getByLabel("Project description", { exact: true })
    .fill("Bring the new workspace to our customers.");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Product launch", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Project settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Add status", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill("Ship the launch");
  await page.getByLabel("Task description", { exact: true }).fill("Final checks and release.");
  await choose(page, "Status", "In Review");
  await choose(page, "Priority", "High");
  await choose(page, "Assignee", account.name);
  await page.getByLabel("Due date", { exact: true }).fill("2026-12-01");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  const details = page.getByRole("region", { name: "Task details", exact: true });
  await expect(
    details.getByRole("heading", { name: "Ship the launch", exact: true }),
  ).toBeVisible();
  await expect(details).toContainText("In Review");
  await expect(details).toContainText("2026-12-01");
  await expect(details).toContainText(account.name);
  await details.getByLabel("Add a comment", { exact: true }).fill("Ready for final review.");
  await details.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(details.getByText("Ready for final review.", { exact: true })).toBeVisible();
  await details.getByRole("button", { name: "Add subtask", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill("Check release notes");
  await page.getByRole("button", { name: "Create subtask", exact: true }).click();
  await expect(page.getByText("Subtask of Ship the launch", { exact: true })).toBeVisible();
  await details.getByRole("button", { name: "Edit task", exact: true }).click();
  await choose(page, "Status", "Completed");
  await page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(details.getByRole("definition").filter({ hasText: /^Completed$/ })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Check release notes/ }).click();
  await expect(
    details.getByRole("heading", { name: "Check release notes", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Close task", exact: true })).toBeVisible();
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
});
