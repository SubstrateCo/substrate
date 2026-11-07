import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { callTasks } from "../test-support/tasks.js";
import { expect } from "@playwright/test";

test("source task cancellation and validation preserve the thread draft and submission creates one linked task", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const { page } = desktop;
  let taskCreations = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/context/source-tasks"
    )
      taskCreations++;
  });
  const project = "Polish project";
  await callTasks(page, { action: "createProject", name: project });
  const conversation = await callMessaging<{ id: string }>(page, "createConversation", {
    kind: "channel",
    name: "product-polish",
  });
  expect(conversation.error).toBeNull();
  const root = await callMessaging<{ id: string }>(page, "sendMessage", {
    conversationId: conversation.data!.id,
    body: "Improve the projects empty state",
  });
  expect(root.error).toBeNull();
  const source = "Add an explanation and a Create project button.";
  expect(
    (
      await callMessaging(page, "sendMessage", {
        conversationId: conversation.data!.id,
        threadId: root.data!.id,
        body: source,
      })
    ).error,
  ).toBeNull();
  await desktop.openPath(
    `/dashboard?conversationId=${conversation.data!.id}&messageId=${root.data!.id}`,
  );
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  const replyComposer = thread.getByRole("textbox", { name: "Reply in thread…", exact: true });
  await replyComposer.fill("Keep this reply draft.");
  const message = thread.getByRole("article").filter({ hasText: source });
  await message.getByRole("group", { name: "Message actions", exact: true }).hover();
  await message.getByRole("button", { name: "Create task", exact: true }).click();
  const builder = thread.getByRole("region", { name: "Create task from message", exact: true });
  await builder.getByRole("combobox", { name: "Destination project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  const form = builder.getByRole("form", { name: "New task", exact: true });
  await form.getByLabel("Task title", { exact: true }).fill("Add a projects empty state");
  const sourcePreview = form.getByRole("group", { name: "Source message", exact: true });
  await expect(sourcePreview.getByText(source, { exact: true })).toBeHidden();
  await sourcePreview.getByText("Linked to this message", { exact: true }).click();
  await expect(sourcePreview.getByText(source, { exact: true })).toBeVisible();
  await form.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(builder).toHaveCount(0);
  expect(taskCreations, "Cancel does not create a task").toBe(0);
  await expect(replyComposer).toHaveText("Keep this reply draft.");

  await message.getByRole("group", { name: "Message actions", exact: true }).hover();
  await message.getByRole("button", { name: "Create task", exact: true }).click();
  await builder.getByRole("combobox", { name: "Destination project", exact: true }).click();
  await page.getByRole("option", { name: project, exact: true }).click();
  await form.getByLabel("Task title", { exact: true }).fill("   ");
  await form.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(form.getByText("Enter a task title.", { exact: true })).toBeVisible();
  expect(taskCreations, "Invalid input does not create a task").toBe(0);
  await expect(builder.getByRole("link", { name: "Open created task", exact: true })).toHaveCount(
    0,
  );
  await form.getByLabel("Task title", { exact: true }).fill("Add a projects empty state");
  const create = form.getByRole("button", { name: "Create task", exact: true });
  await create.scrollIntoViewIfNeeded();
  await expect(create).toBeInViewport();
  await create.click();
  const createdTask = message.getByRole("link", {
    name: "Open Add a projects empty state",
    exact: true,
  });
  await expect(createdTask).toBeVisible();
  expect(taskCreations, "Submission creates one linked task").toBe(1);
  await expect(replyComposer).toHaveText("Keep this reply draft.");
  await createdTask.click();
  const details = page.getByRole("region", { name: "Task details", exact: true });
  await expect(
    details.getByRole("heading", { name: "Add a projects empty state", exact: true }),
  ).toBeVisible();
  await expect(details.getByText(source, { exact: true })).toBeVisible();
});
