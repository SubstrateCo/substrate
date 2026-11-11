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
  const edit = page.getByRole("dialog", { name: "Edit message", exact: true });
  await edit.getByLabel("Message", { exact: true }).fill("Corrected thread announcement");
  await edit.getByRole("button", { name: "Save message", exact: true }).click();
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
