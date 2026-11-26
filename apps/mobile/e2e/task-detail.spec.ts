import { captureScreenshot } from "./test-support/capture";
import { mutation, test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";

test("Expo web preview: task detail, subtasks, links, and persisted status", async ({
  page,
  workspace,
}, info) => {
  for (const otherEntityId of [workspace.projectId, workspace.taskId]) {
    const linked = await workspace.request.post("/api/v1/crm/links", {
      data: {
        organizationId: workspace.organizationId,
        entityId: workspace.accountId,
        otherEntityId,
      },
    });
    expect(linked.ok()).toBe(true);
    expect(await linked.json()).toMatchObject({ success: true });
  }
  const destination = await mutation<{ id: string }>(workspace.request, "tasks/mutations", {
    organizationId: workspace.organizationId,
    action: "createProject",
    name: "Partner handoff · synthetic",
  });
  const remoteTitle = "Prepare partner handoff · synthetic";
  await mutation<{ id: string }>(workspace.request, "tasks/mutations", {
    organizationId: workspace.organizationId,
    action: "createTask",
    projectEntityId: destination.id,
    title: remoteTitle,
  });
  await signIn(page, info, workspace);
  await page.getByTestId("nav-tasks").click();
  await page.getByTestId(`project-${workspace.projectId}`).click();
  const projectConnections = page.getByTestId("project-detail").getByTestId("record-connections");
  await expect(
    projectConnections.getByRole("button", { name: "Northstar Studio · synthetic", exact: true }),
  ).toBeVisible();
  await expect(
    projectConnections.getByRole("button", { name: "Link record", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Review the mobile launch checklist", exact: true })
    .click();
  await expect(page.getByTestId("task-detail")).toBeVisible();
  const taskConnections = page.getByTestId("task-detail").getByTestId("record-connections");
  await expect(
    taskConnections.getByRole("button", { name: "Northstar Studio · synthetic", exact: true }),
  ).toBeVisible();
  await expect(
    taskConnections.getByRole("button", { name: "Link record", exact: true }),
  ).toHaveCount(0);
  const messageBacklink = page.getByTestId("task-detail").getByRole("button", {
    name: "The mobile launch checklist is ready for review.",
    exact: true,
  });
  await expect(messageBacklink).toBeVisible();
  await expect(messageBacklink).toContainText("Linked");
  await expect(messageBacklink).toContainText(workspace.conversationName);
  await captureScreenshot(page, info, "task-detail");

  await page.getByRole("button", { name: /^Assignee:/ }).click();
  await expect(page.getByRole("button", { name: workspace.member.name, exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();

  await page.getByRole("button", { name: /^Edit Task/ }).click();
  await expect(page.getByRole("heading", { name: "Edit task", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "task-edit");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: /^Due:/ }).click();
  await expect(page.getByRole("textbox", { name: "Due date", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "task-due-date");
  await page.getByRole("textbox", { name: "Due date", exact: true }).fill("2026-12-15");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Due:/ })).not.toContainText("No due date");

  await page.getByRole("button", { name: "New subtask", exact: true }).click();
  await expect(page.getByRole("heading", { name: "New subtask", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "task-new-subtask");
  const subtask = "Confirm partner handoff · synthetic subtask";
  await page.getByLabel("Title", { exact: true }).fill(subtask);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.getByRole("button", { name: subtask, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Link a task", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Link type", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "task-link-type");
  await page.getByRole("button", { name: "Relates to", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Relates to…", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "task-link-target");
  await page.getByRole("button", { name: "Choose another project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose a project", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "task-link-project-picker");
  await page.getByRole("button", { name: "Partner handoff · synthetic", exact: true }).click();
  await page.getByRole("button", { name: remoteTitle, exact: false }).click();
  const linkedTask = page
    .getByRole("button", { name: remoteTitle, exact: true })
    .filter({ has: page.getByText(/Relates to/) });
  await expect(linkedTask).toBeVisible();
  await linkedTask.click();
  await expect(page.getByRole("button", { name: "Remove link", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "task-linked-task-actions");
  await page
    .getByRole("dialog", { name: remoteTitle, exact: true })
    .getByRole("button", { name: "Close", exact: true })
    .click();

  await page.getByRole("button", { name: /^More Task.* actions$/ }).click();
  await captureScreenshot(page, info, "task-actions");
  await page.getByRole("button", { name: "Move to another project", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Move to project", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mobile launch · synthetic/ })).toBeVisible();
  await captureScreenshot(page, info, "task-move-project");
  await page.getByRole("button", { name: "Partner handoff · synthetic", exact: true }).click();
  await page.getByRole("button", { name: remoteTitle, exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText(
    "Readers of the destination project gain access",
  );
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Move task", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Project: Partner handoff · synthetic", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Parent: ${remoteTitle}`, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: subtask, exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^More Task.* actions$/ }).click();
  await page.getByRole("button", { name: "Delete task", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Delete this task?");
  await captureScreenshot(page, info, "task-delete-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByRole("button", { name: /^Status:/ }).click();
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.getByRole("button", { name: "Status: Completed", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Status: Completed", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Project: Partner handoff · synthetic", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Parent: ${remoteTitle}`, exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "task-status-persisted");
  await page.getByRole("button", { name: /^Due:/ }).click();
  await expect(page.getByRole("textbox", { name: "Due date", exact: true })).toHaveValue(
    "2026-12-15",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await messageBacklink.click();
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("conversationId") === workspace.conversationId &&
      url.searchParams.get("messageId") === workspace.messageId,
  );
  await expect(page.getByTestId(`message-${workspace.messageId}`)).toBeVisible();
});
