import { captureScreenshot } from "./test-support/capture";
import { projectPicture, releaseChecklist } from "./test-support/files";
import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Expo web preview: real project picture, task attachment, and new discussion navigation", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.getByTestId("nav-tasks").click();
  await page.getByTestId(`project-${workspace.projectId}`).click();
  const pickingPicture = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add picture", exact: true }).click();
  await (await pickingPicture).setFiles(projectPicture);
  await expect(page.getByRole("button", { name: "Remove picture", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove picture", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "project-picture-upload-persisted");
  await page.getByRole("button", { name: "Remove picture", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remove project picture?");
  await captureScreenshot(page, info, "project-picture-remove-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Review the mobile launch checklist", exact: true })
    .click();
  await expect(page.getByTestId("task-detail")).toBeVisible();
  const pickingFile = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add files", exact: true }).click();
  await (await pickingFile).setFiles(releaseChecklist);
  const attachment = page.getByRole("button", { name: releaseChecklist.name, exact: true });
  await expect(attachment).toBeVisible();
  await page.reload();
  await expect(attachment).toBeVisible();
  await captureScreenshot(page, info, "task-attachment-upload-persisted");
  await attachment.click();
  await expect(page.getByRole("button", { name: "Save file", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "task-attachment-actions");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save file", exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(releaseChecklist.name);
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error("The task attachment did not produce a local file.");
  expect(await readFile(downloadedPath)).toEqual(releaseChecklist.buffer);
  await expect(page.getByRole("dialog", { name: releaseChecklist.name, exact: true })).toHaveCount(
    0,
  );
  await attachment.click();
  await page.getByRole("button", { name: "Remove attachment", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Remove attachment?");
  await captureScreenshot(page, info, "task-attachment-remove-confirmation");
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  const opening = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/tasks/discussion") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Open discussion", exact: true }).click();
  const response = await opening;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({
    projectEntityId: workspace.projectId,
    taskEntityId: workspace.taskId,
  });
  await expect(page.getByTestId("conversation-header")).toContainText("Task discussion");
  await captureScreenshot(page, info, "task-new-discussion-fullscreen");
  const comment = "Jordan's handoff checklist is attached · synthetic discussion";
  await page.getByRole("textbox").fill(comment);
  await page.getByTestId("send-message").click();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await captureScreenshot(page, info, "task-discussion-comment-persisted");
  await page.getByTestId("conversation-header").click();
  await expect(page.getByTestId("task-detail")).toBeVisible();
  await expect(
    page.getByRole("button", { name: releaseChecklist.name, exact: true }),
  ).toBeVisible();
  await captureScreenshot(page, info, "task-discussion-return-to-task");
});
