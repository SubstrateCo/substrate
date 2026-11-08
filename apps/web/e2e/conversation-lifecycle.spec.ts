import { conversation, expectChange, post, test, visit } from "./test-support/fixtures";
import { project } from "./test-support/tasks";
import { expect } from "@playwright/test";

test("deleting a channel keeps its linked task and removes the channel for every member", async ({
  actors,
  client,
}) => {
  const [created, channel] = await Promise.all([
    project(actors.sender),
    conversation(actors.sender, [actors.member.email]),
  ]);
  const body = `Delete me ${channel.id}`;
  const message = await post<{ id: string }>(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body,
  });
  const title = `Survives ${channel.id}`;
  await post(actors.sender, "context/source-tasks", {
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    messageId: message.id,
    requestId: crypto.randomUUID(),
    title,
  });
  const [sender, member] = await Promise.all([client(actors.sender), client(actors.member)]);
  await Promise.all([visit(sender, channel.id), visit(member, channel.id)]);
  await sender.page
    .getByRole("article")
    .filter({ hasText: body })
    .getByRole("link", { name: `Open ${title}`, exact: true })
    .click();
  const task = sender.page.getByRole("region", { name: "Task details", exact: true });
  await expect(task.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const taskUrl = sender.page.url();
  await visit(sender, channel.id);

  const since = member.events.length;
  await sender.page.getByRole("button", { name: "Conversation actions", exact: true }).click();
  await sender.page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  const dialog = sender.page.getByRole("dialog", { name: `Delete ${channel.name}?` });
  await expect(dialog.getByText(/1 task or project links to its messages/)).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect.poll(() => new URL(sender.page.url()).searchParams.get("conversationId")).toBeNull();
  await expect(sender.page.getByText(channel.name, { exact: true })).toHaveCount(0);
  await expectChange(member, since, "messaging");
  await expect(member.page.getByText("Conversation unavailable or access denied.")).toBeVisible();
  await expect(member.page.getByText(channel.name, { exact: true })).toHaveCount(0);

  await sender.page.goto(taskUrl);
  await expect(task.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(
    task.getByRole("link", { name: `Created from a discussion · ${channel.name}`, exact: true }),
  ).toHaveCount(0);
});

test("a member leaves a private channel and loses access to it", async ({ actors, client }) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const member = await client(actors.member);
  await visit(member, channel.id);
  await member.page.getByRole("button", { name: "Conversation actions", exact: true }).click();
  await expect(member.page.getByRole("menuitem", { name: "Delete", exact: true })).toHaveCount(0);
  await member.page.getByRole("menuitem", { name: "Leave", exact: true }).click();
  await member.page
    .getByRole("dialog", { name: `Leave ${channel.name}?` })
    .getByRole("button", { name: "Leave", exact: true })
    .click();
  await expect.poll(() => new URL(member.page.url()).searchParams.get("conversationId")).toBeNull();
  await expect(member.page.getByText(channel.name, { exact: true })).toHaveCount(0);
  await visit(member, channel.id);
  await expect(member.page.getByText("Conversation unavailable or access denied.")).toBeVisible();
});
