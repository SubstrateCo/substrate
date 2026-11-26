import { captureMotion, captureScreenshot } from "./test-support/capture";
import { test } from "./test-support/fixtures";
import { closePanel, signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: projects, form discard, and persisted project creation", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.getByTestId("nav-tasks").click();
  await expect(page.getByTestId(`project-${workspace.projectId}`)).toBeVisible();
  await captureScreenshot(page, info, "tasks-project-list");

  await page.getByTestId("new-project").click();
  await expect(page.getByRole("heading", { name: "New project", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "tasks-new-project");
  await page.getByLabel("Name", { exact: true }).fill("Unsaved synthetic project");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Discard changes?");
  await captureScreenshot(page, info, "tasks-discard-changes");
  await confirmation.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.getByTestId(`project-${workspace.projectId}`)).toBeVisible();

  await captureMotion(page, info, "project-panel-open", async () => {
    await page.getByTestId(`project-${workspace.projectId}`).click();
    await expect(page.getByTestId("project-detail")).toBeVisible();
  });
  await captureScreenshot(page, info, "tasks-project-detail");
  await page.getByRole("button", { name: "Edit Project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit project", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "tasks-edit-project");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "More Project actions", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Members and access", exact: false }),
  ).toBeVisible();
  await captureScreenshot(page, info, "tasks-project-actions");
  await page.getByRole("button", { name: "Members and access", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "tasks-project-members");
  await page.getByRole("button", { name: "Add member", exact: true }).click();
  await expect(
    page.getByRole("button", { name: workspace.member.name, exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "tasks-add-member-picker");
  await page.getByRole("button", { name: workspace.member.name, exact: true }).click();
  await expect(page.getByRole("heading", { name: "Access level", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "tasks-member-access-picker");
  await page.getByRole("button", { name: "Can view", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Change project access?");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirm access", exact: true })
    .click();
  await page
    .getByRole("button", { name: `${workspace.member.name}, Can view`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove from project", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "tasks-member-access-actions");
  await page.getByRole("button", { name: "Remove from project", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText(`Remove ${workspace.member.name}?`);
  await captureScreenshot(page, info, "tasks-remove-member-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Members", exact: true }) })
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await page.getByRole("button", { name: "More Project actions", exact: true }).click();
  await page.getByRole("button", { name: "Archive project", exact: false }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Archive this project?");
  await captureScreenshot(page, info, "tasks-archive-project-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByTestId("new-task").click();
  await expect(page.getByRole("heading", { name: "New task", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "tasks-new-task");
  for (const field of ["Status", "Priority", "Assignee"]) {
    await page.getByRole("button", { name: new RegExp(`^${field}:`) }).click();
    await expect(page.getByRole("heading", { name: field, exact: true })).toBeVisible();
    await captureScreenshot(page, info, `tasks-${field.toLowerCase()}-picker`);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
  await page.getByLabel("Title", { exact: true }).fill("Task created from mobile · synthetic");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Task created from mobile · synthetic", exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "tasks-created-task");
  await closePanel(page);

  const name = "Created from Expo web preview · synthetic";
  await page.getByTestId("new-project").click();
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Created through the real mobile form.");
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByTestId("record-panel").getByText(name, { exact: true })).toBeVisible();
  await closePanel(page);
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "tasks-created-project-persisted");
});
