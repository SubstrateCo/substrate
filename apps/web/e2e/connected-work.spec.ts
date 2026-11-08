import { conversation, expect, post, test, visit } from "./test-support/fixtures";
import { pauseClock, searches, visibleWithClock } from "./test-support/search";
import { project } from "./test-support/tasks";

test("follow existing message-task links without task creation actions and find the task in search", async ({
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
  await expect(sourceMessage.getByRole("button", { name: "Create task", exact: true })).toHaveCount(
    0,
  );
  await pauseClock(sender.page);
  const requests = searches(sender.page);

  await sender.page.getByRole("button", { name: "Link existing work", exact: true }).click();
  const picker = sender.page.getByRole("region", { name: "Link existing work", exact: true });
  await picker.getByRole("button", { name: "Projects", exact: true }).click();
  const linkInput = picker.getByRole("textbox", { name: "Search work to link" });
  await linkInput.fill("intermediate link lookup");
  await sender.page.clock.runFor(100);
  await linkInput.fill(created.name);
  expect(requests.filter((request) => request.query)).toEqual([]);
  await visibleWithClock(sender.page, picker.getByText(created.name, { exact: true }));
  await linkInput.fill("unsettled link lookup");
  await expect(picker.getByText(created.name, { exact: true })).toHaveCount(0);
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await sender.page.clock.runFor(300);
  expect(requests.some((request) => request.query === "unsettled link lookup")).toBe(false);

  const editor = sender.page.getByRole("textbox", { name: /^Message / });
  await editor.fill("@");
  const referenceInput = sender.page.getByRole("combobox", { name: "Search references" });
  await expect(referenceInput).toBeVisible();
  await sender.page.getByRole("tab", { name: "People", exact: true }).click();
  await referenceInput.fill("intermediate reference lookup");
  await sender.page.clock.runFor(100);
  await referenceInput.fill(actors.sender.name);
  expect(requests.some((request) => request.query === "intermediate reference lookup")).toBe(false);
  const option = sender.page.getByRole("option", { name: actors.sender.name, exact: true });
  await visibleWithClock(sender.page, option);
  await referenceInput.fill("unsettled reference lookup");
  await expect(option).toHaveCount(0);
  await sender.page.getByRole("button", { name: "Close references", exact: true }).click();
  await sender.page.clock.runFor(300);
  expect(requests.some((request) => request.query === "unsettled reference lookup")).toBe(false);
  await editor.fill("");
  await sender.page.clock.resume();
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
  await expect(thread.getByRole("button", { name: "Create task", exact: true })).toHaveCount(0);
  await expect(
    thread.getByRole("button", { name: "Link existing work", exact: true }),
  ).toBeVisible();
  await expect(
    sender.page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByRole("link", { name: `Open ${title}`, exact: true }),
  ).toBeVisible();
  await sender.page.clock.pauseAt(new Date((await sender.page.evaluate(() => Date.now())) + 100));
  requests.length = 0;
  const searchInput = sender.page.getByRole("combobox", { name: "Search workspace", exact: true });
  await searchInput.click();
  await searchInput.fill("intermediate workspace lookup");
  await sender.page.clock.runFor(100);
  await searchInput.fill(title);
  expect(requests.filter((request) => request.query)).toEqual([]);
  const result = sender.page
    .getByRole("region", { name: "Workspace search", exact: true })
    .getByRole("link", { name: new RegExp(title) });
  await visibleWithClock(sender.page, result);
  expect(requests.filter((request) => request.query).map((request) => request.query)).toEqual([
    title,
  ]);
  await searchInput.fill("cancelled workspace lookup");
  await searchInput.press("Escape");
  await sender.page.clock.runFor(300);
  expect(requests.some((request) => request.query === "cancelled workspace lookup")).toBe(false);
  await sender.page.clock.resume();
  await searchInput.fill(title);
  await result.click();
  await expect(task.getByRole("heading", { name: title, exact: true })).toBeVisible();
  expect(new URL(sender.page.url()).searchParams.get("taskId")).toBe(taskId);
});
