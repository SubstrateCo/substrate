import { conversation, post, test, visit } from "./test-support/fixtures";
import { project } from "./test-support/tasks";
import { expect, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function dropFiles(zone: Locator, name: string, contents: string) {
  const transfer = await zone.page().evaluateHandle(
    ({ name, contents }) => {
      const data = new DataTransfer();
      data.items.add(new File([contents], name, { type: "text/plain" }));
      return data;
    },
    { name, contents },
  );
  try {
    await zone.dispatchEvent("dragenter", { dataTransfer: transfer });
    await expect(zone.getByText("Drop files to attach", { exact: true })).toBeVisible();
    await zone.dispatchEvent("dragover", { dataTransfer: transfer });
    await zone.dispatchEvent("drop", { dataTransfer: transfer });
  } finally {
    await transfer.dispose();
  }
}

test("drag and drop a message file, send without text, reload and download", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  await visit(sender, channel.id);
  const zone = sender.page.getByRole("region", { name: "Message attachments", exact: true });
  const contents = "Launch notes\nThe attachment service is ready for review.\n";
  await dropFiles(zone, "launch-notes.txt", contents);
  await expect(zone.getByText("Ready to attach", { exact: true })).toBeVisible();
  await zone.getByRole("button", { name: "Send", exact: true }).click();
  const link = sender.page.getByRole("link", { name: "Download launch-notes.txt", exact: true });
  await expect(link).toBeVisible();
  await expect(zone.getByRole("list", { name: "Selected attachments" })).toHaveCount(0);
  await sender.page.reload();
  await expect(link).toBeVisible();
  const download = sender.page.waitForEvent("download");
  await link.click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("launch-notes.txt");
  expect(await readFile((await saved.path())!, "utf8")).toBe(contents);
});

test("drag and drop task files, download, then remove with confirmation", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const created = await project(actors.sender);
  const task = await post<{ id: string }>(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Review launch attachments",
  });
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  const zone = sender.page.getByRole("region", { name: "Task attachments", exact: true });
  await expect(zone.getByRole("button", { name: "Attach files", exact: true })).toBeEnabled();
  const contents = "Launch checklist\nReview attachments in tasks and messages.\n";
  await dropFiles(zone, "launch-checklist.txt", contents);
  await expect(zone.getByText("Ready to attach", { exact: true })).toBeVisible();
  await zone.getByRole("button", { name: "Attach files to task", exact: true }).click();
  const link = zone.getByRole("link", { name: "Download launch-checklist.txt", exact: true });
  await expect(link).toBeVisible();
  await sender.page.reload();
  await expect(link).toBeVisible();
  const download = sender.page.waitForEvent("download");
  await link.click();
  const saved = await download;
  expect(saved.suggestedFilename()).toBe("launch-checklist.txt");
  expect(await readFile((await saved.path())!, "utf8")).toBe(contents);
  await link.hover();
  await zone.getByRole("button", { name: "Remove launch-checklist.txt", exact: true }).click();
  await sender.page
    .getByRole("dialog", { name: "Remove launch-checklist.txt?", exact: true })
    .getByRole("button", { name: "Remove attachment", exact: true })
    .click();
  await expect(link).toHaveCount(0);
  await expect(
    zone.getByText("Drop files here, or choose Attach files.", { exact: false }),
  ).toBeVisible();
});

test("file selection rejects oversized files and retries failed uploads without losing the message draft", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  await visit(sender, channel.id);
  const zone = sender.page.getByRole("region", { name: "Message attachments", exact: true });
  const input = zone.getByLabel("Choose attachment files");
  await input.setInputFiles({
    name: "too-large.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(zone.getByRole("alert")).toHaveText("Choose files between 1 byte and 5 MiB each.");
  await expect(zone.getByRole("list", { name: "Selected attachments" })).toHaveCount(0);
  await zone.getByRole("textbox").fill("Keep this message while the upload retries.");
  await sender.page.route("**/api/v1/files/uploads", (route) => route.abort(), { times: 1 });
  await input.setInputFiles({
    name: "retry.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Retry content"),
  });
  await expect(zone.getByText("Upload failed. Try again.", { exact: true })).toBeVisible();
  await expect(zone.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await zone.getByRole("button", { name: "Retry retry.txt", exact: true }).click();
  await expect(zone.getByText("Ready to attach", { exact: true })).toBeVisible();
  await expect(zone.getByRole("textbox")).toHaveText("Keep this message while the upload retries.");
  await zone.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    sender.page
      .getByRole("article")
      .filter({ hasText: "Keep this message" })
      .getByRole("link", { name: "Download retry.txt" }),
  ).toBeVisible();
});

test("new tasks save their selected files together and thread replies support attachments", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const created = await project(actors.sender);
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/tasks", { projectId: created.entityId });
  await sender.page
    .getByRole("group", { name: "Project actions", exact: true })
    .getByRole("button", { name: "New task", exact: true })
    .click();
  const dialog = sender.page.getByRole("dialog", { name: "New task", exact: true });
  await dialog.getByLabel("Task title", { exact: true }).fill("Task created with a file");
  await dropFiles(
    dialog.getByRole("region", { name: "New task attachments", exact: true }),
    "task-brief.txt",
    "The task and its attachment are saved together.",
  );
  await expect(dialog.getByText("Ready to attach", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(
    sender.page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("link", { name: "Download task-brief.txt", exact: true }),
  ).toBeVisible();
  const channel = await conversation(actors.sender);
  await post(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: "Review files in this thread",
  });
  await visit(sender, channel.id);
  await sender.page
    .getByRole("article")
    .filter({ hasText: "Review files in this thread" })
    .getByRole("button", { name: "Reply in thread", exact: true })
    .click();
  const thread = sender.page.getByRole("complementary", { name: "Thread", exact: true });
  const zone = thread.getByRole("region", { name: "Message attachments", exact: true });
  await dropFiles(zone, "thread-review.txt", "This file belongs to the thread reply.");
  await expect(zone.getByText("Ready to attach", { exact: true })).toBeVisible();
  await zone.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    thread.getByRole("link", { name: "Download thread-review.txt", exact: true }),
  ).toBeVisible();
});
