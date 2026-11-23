import { conversation, test, visit } from "../test-support/fixtures";
import { project } from "../test-support/tasks";
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

test("message and thread files send without text, persist, and download", async ({
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
  await link
    .locator("xpath=ancestor::article")
    .getByRole("button", { name: "Reply in thread", exact: true })
    .click();
  const thread = sender.page.getByRole("complementary", { name: "Thread", exact: true });
  const replyZone = thread.getByRole("region", { name: "Message attachments", exact: true });
  await dropFiles(replyZone, "thread-review.txt", "This file belongs to the thread reply.");
  await expect(replyZone.getByText("Ready to attach", { exact: true })).toBeVisible();
  await replyZone.getByRole("button", { name: "Send", exact: true }).click();
  const replyLink = thread.getByRole("link", { name: "Download thread-review.txt", exact: true });
  await expect(replyLink).toBeVisible();
  await sender.page.reload();
  await expect(replyLink).toBeVisible();
});

test("removing an active attachment aborts it and ignores its late completion", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const zone = page.getByRole("region", { name: "Message attachments", exact: true });
  const completed = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();
  const completionUrl = "**/api/v1/files/uploads/*/complete";
  await page.route(completionUrl, async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    expect((await response.json()).data.fileId).toBeTruthy();
    completed.resolve();
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      delivered.resolve();
    }
  });
  try {
    await dropFiles(zone, "removed.txt", "This real upload must not be sent.");
    await completed.promise;
    await expect(zone.getByText("Finishing upload", { exact: true })).toBeVisible();
    const aborted = page.waitForEvent("requestfailed", {
      predicate: (request) => new URL(request.url()).pathname.endsWith("/complete"),
    });
    await zone.getByRole("button", { name: "Remove removed.txt", exact: true }).click();
    expect((await aborted).failure()?.errorText).toContain("ERR_ABORTED");
    release.resolve();
    await delivered.promise;
    await expect(zone.getByRole("list", { name: "Selected attachments" })).toHaveCount(0);
    await expect(zone.getByRole("button", { name: "Send", exact: true })).toBeDisabled();

    const body = "Send only the text after removing the upload.";
    await zone.getByRole("textbox").fill(body);
    const sent = page.waitForRequest(
      (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/v1/messaging/messages",
    );
    await zone.getByRole("button", { name: "Send", exact: true }).click();
    expect((await sent).postDataJSON().attachmentFileIds).toEqual([]);
    const message = page.getByRole("article").filter({ hasText: body });
    await expect(message).toBeVisible();
    await expect(
      message.getByRole("link", { name: "Download removed.txt", exact: true }),
    ).toHaveCount(0);
    const response = await actors.sender.request.get("/api/v1/messaging/messages", {
      params: { organizationId: actors.sender.organizationId, conversationId: channel.id },
    });
    expect(response.ok()).toBe(true);
    const { data } = await response.json();
    expect(data.find((entry: { body: string }) => entry.body === body)).toMatchObject({
      attachments: [],
    });
  } finally {
    release.resolve();
    await page.unroute(completionUrl);
  }
});

test("create a task with a file, attach another, download, and remove with confirmation", async ({
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
  await dialog.getByLabel("Task title", { exact: true }).fill("Review launch attachments");
  await dropFiles(
    dialog.getByRole("region", { name: "New task attachments", exact: true }),
    "task-brief.txt",
    "The task is created with this attachment.",
  );
  await expect(dialog.getByText("Ready to attach", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  const zone = sender.page.getByRole("region", { name: "Task attachments", exact: true });
  await expect(
    zone.getByRole("link", { name: "Download task-brief.txt", exact: true }),
  ).toBeVisible();
  await sender.page.reload();
  await expect(
    zone.getByRole("link", { name: "Download task-brief.txt", exact: true }),
  ).toBeVisible();
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
  await sender.page.reload();
  await expect(link).toHaveCount(0);
  await expect(
    zone.getByRole("link", { name: "Download task-brief.txt", exact: true }),
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
