import { conversation, post, test, visit } from "./test-support/fixtures";
import { project } from "./test-support/tasks";
import { expect } from "@playwright/test";

test("follow existing message-task links and find the task in search", async ({
  actors,
  client,
}) => {
  const [created, channel] = await Promise.all([
    project(actors.sender),
    conversation(actors.sender),
  ]);
  const source = `Customer request ${channel.id}`;
  const message = await post<{ id: string }>(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: source,
  });
  const title = `Follow up ${channel.id}`;
  await post(actors.sender, "context/source-tasks", {
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    messageId: message.id,
    requestId: crypto.randomUUID(),
    title,
  });
  const sender = await client(actors.sender);
  await visit(sender, channel.id);
  const sourceMessage = sender.page.getByRole("article").filter({ hasText: source });
  await expect(sourceMessage).toBeVisible();
  const linkedTask = sender.page
    .getByRole("article")
    .filter({ hasText: source })
    .getByRole("link", { name: `Open ${title}`, exact: true });
  await linkedTask.click();
  const task = sender.page.getByRole("region", { name: "Task details", exact: true });
  await expect(task.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const taskId = new URL(sender.page.url()).searchParams.get("taskId");
  await task
    .getByRole("link", { name: `Created from a discussion · ${channel.name}`, exact: true })
    .click();
  await expect(
    sender.page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByText(source, { exact: true }),
  ).toBeVisible();
  expect(new URL(sender.page.url()).searchParams.get("messageId")).toBe(message.id);
  const thread = sender.page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(
    thread.getByRole("button", { name: "Link existing work", exact: true }),
  ).toBeVisible();
  await expect(
    sender.page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByRole("link", { name: `Open ${title}`, exact: true }),
  ).toBeVisible();
  const searchInput = sender.page.getByRole("combobox", { name: "Search workspace", exact: true });
  await searchInput.click();
  await searchInput.fill(title);
  await sender.page
    .getByRole("region", { name: "Workspace search", exact: true })
    .getByRole("link", { name: new RegExp(title) })
    .click();
  await expect(task.getByRole("heading", { name: title, exact: true })).toBeVisible();
  expect(new URL(sender.page.url()).searchParams.get("taskId")).toBe(taskId);
});
