import { captureScreenshot } from "./test-support/capture";
import { releaseChecklist } from "./test-support/files";
import { test } from "./test-support/fixtures";
import { signIn } from "./test-support/navigation";
import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Expo web preview: attach a synthetic file through the real message composer", async ({
  page,
  workspace,
}, info) => {
  await signIn(page, info, workspace);
  await page.goto(`/?${new URLSearchParams({ conversationId: workspace.conversationId })}`);
  await page.getByRole("button", { name: "Attach files", exact: true }).click();
  await expect(page.getByRole("button", { name: "Files", exact: true })).toBeVisible();
  await captureScreenshot(page, info, "message-attachment-picker-actions");
  const picking = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Files", exact: true }).click();
  await (await picking).setFiles(releaseChecklist);
  await expect(page.getByText(releaseChecklist.name, { exact: true })).toBeVisible();
  const caption = "Launch checklist for the design review · synthetic file message";
  await page.getByRole("textbox").fill(caption);
  await expect(page.getByTestId("send-message")).toBeEnabled();
  await captureScreenshot(page, info, "message-file-upload-ready");
  await page.getByTestId("send-message").click();
  await expect(page.getByText(caption, { exact: true })).toBeVisible();
  const attachment = page.getByRole("button", {
    name: /^Download synthetic-release-checklist\.txt,/,
  });
  await expect(attachment).toBeVisible();
  await page.reload();
  await expect(page.getByText(caption, { exact: true })).toBeVisible();
  await expect(attachment).toBeVisible();
  await captureScreenshot(page, info, "message-file-persisted");
  const downloading = page.waitForEvent("download");
  await attachment.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(releaseChecklist.name);
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error("The attachment download did not produce a local file.");
  expect(await readFile(downloadedPath)).toEqual(releaseChecklist.buffer);
});
