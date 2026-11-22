import { conversation, conversationButton, post, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("editing and deleting a thread root retains its replies and permalink", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: "Original thread announcement",
  });
  await post(actors.member, "messaging/messages", {
    conversationId: channel.id,
    threadId: root.id,
    body: "Keep this reply after the root is deleted",
  });
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const article = page.getByRole("article").filter({ hasText: "Original thread announcement" });
  await article.getByRole("button", { name: "More message actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit message", exact: true }).click();
  await article
    .getByRole("textbox", { name: "Edit message", exact: true })
    .fill("Corrected thread announcement");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const updated = page.getByRole("article").filter({ hasText: "Corrected thread announcement" });
  await expect(updated).toContainText("Edited");
  await updated.getByRole("button", { name: "More message actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete message", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Delete message?", exact: true })
    .getByRole("button", { name: "Delete message", exact: true })
    .click();
  const deleted = page.getByRole("article").filter({ hasText: "Message deleted" });
  await expect(deleted).toBeVisible();
  await deleted.getByRole("button", { name: "1 reply", exact: true }).click();
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(
    thread.getByText("Keep this reply after the root is deleted", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    thread.getByText("Keep this reply after the root is deleted", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Corrected thread announcement", { exact: true })).toHaveCount(0);
});

test("editing a message inserts a workspace reference from the picker", async ({
  actors,
  client,
}, testInfo) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const response = await actors.sender.request.get("/api/v1/messaging/conversations", {
    params: { organizationId: actors.sender.organizationId },
  });
  const { data } = await response.json();
  const senderActorId = data
    .find((item: { id: string }) => item.id === channel.id)
    .members.find((item: { name: string }) => item.name === actors.sender.name).actorId;
  const original = "Review the launch plan";
  await post(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: `${original} with @[person:${senderActorId}]`,
  });
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const article = page.getByRole("article").filter({ hasText: original });
  await article.getByRole("button", { name: "More message actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit message", exact: true }).click();
  // The message is edited in place, not in a dialog.
  const field = article.getByRole("textbox", { name: "Edit message", exact: true });
  await expect(field).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The existing reference renders as its chip, not as a raw token.
  await expect(field).toContainText(actors.sender.name);
  await expect(field).not.toContainText(senderActorId);
  await field.pressSequentially(` @${actors.member.name.split(" ")[0]}`);
  const option = page.getByRole("option", { name: actors.member.name, exact: true });
  await expect(option).toBeVisible();
  await page.screenshot({
    path: process.env.E2E_SCREENSHOTS_DIR
      ? `${process.env.E2E_SCREENSHOTS_DIR}/edit-message-reference-picker.png`
      : testInfo.outputPath("edit-message-reference-picker.png"),
  });
  await option.click();
  await expect(field).toContainText(actors.member.name);
  await expect(field).toBeFocused();
  await field.press("Enter");
  await expect(field).toHaveCount(0);
  const updated = page.getByRole("article").filter({ hasText: "Edited" });
  await expect(updated).toContainText(original);
  await expect(updated).toContainText(actors.sender.name);
  await expect(updated).toContainText(actors.member.name);
});

test("Escape cancels an inline edit without saving", async ({ actors, client }) => {
  const channel = await conversation(actors.sender);
  const original = "Keep this wording";
  await post(actors.sender, "messaging/messages", { conversationId: channel.id, body: original });
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const article = page.getByRole("article").filter({ hasText: original });
  const actions = article.getByRole("button", { name: "More message actions", exact: true });
  await actions.click();
  await page.getByRole("menuitem", { name: "Edit message", exact: true }).click();
  const field = article.getByRole("textbox", { name: "Edit message", exact: true });
  await field.pressSequentially(" but discard this");
  await field.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(article).toContainText(original);
  await expect(article).not.toContainText("discard this");
  await expect(article).not.toContainText("Edited");
  await expect(actions).toBeFocused();
});

test("removing an internal member through the member list clears their open private conversation", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  const body = `Private before removal ${channel.id}`;
  await post(actors.sender, "messaging/messages", { conversationId: channel.id, body });
  const [sender, member] = await Promise.all([client(actors.sender), client(actors.member)]);
  await Promise.all([visit(sender, channel.id), visit(member, channel.id)]);
  await expect(member.page.getByText(body, { exact: true })).toBeVisible();
  await sender.page.getByRole("button", { name: "Members, 2 members", exact: true }).click();
  await sender.page
    .getByRole("button", { name: `Remove ${actors.member.name}`, exact: true })
    .click();
  await sender.page
    .getByRole("dialog", { name: `Remove ${actors.member.name}?`, exact: true })
    .getByRole("button", { name: "Remove member", exact: true })
    .click();
  await expect(
    member.page.getByRole("heading", { name: "Conversation unavailable", exact: true }),
  ).toBeVisible();
  await expect(member.page.getByText(body, { exact: true })).toHaveCount(0);
  await expect(conversationButton(member.page, channel.name)).toHaveCount(0);
  await expect(
    sender.page.getByRole("button", { name: "Members, 1 member", exact: true }),
  ).toBeVisible();
});
