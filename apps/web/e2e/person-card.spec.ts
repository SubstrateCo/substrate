import { post, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("a message author's profile previews on hover and opens by keyboard", async ({
  actors,
  client,
}) => {
  const channel = await post<{ id: string }>(actors.sender, "messaging/conversations", {
    kind: "channel",
    name: "Launch team",
    private: true,
    emails: [actors.member.email],
  });
  const body = "The launch checklist is ready.";
  await post(actors.sender, "messaging/messages", { conversationId: channel.id, body });

  const viewer = await client(actors.member);
  await visit(viewer, channel.id);
  const author = viewer.page
    .getByRole("article")
    .filter({ hasText: body })
    .getByRole("button", { name: actors.sender.name, exact: true });
  const profile = viewer.page.getByRole("dialog", { name: `${actors.sender.name} profile` });

  await author.hover();
  await expect(profile).toBeVisible();
  await viewer.page.getByRole("heading", { name: "Launch team", exact: true }).hover();
  await expect(profile).toBeHidden();

  await author.focus();
  await viewer.page.keyboard.press("Enter");
  const message = profile.getByRole("button", { name: "Message", exact: true });
  await expect(message).toBeVisible();
  // The profile may load after focus moves into the popover.
  if (!(await message.evaluate((element) => element === document.activeElement)))
    await viewer.page.keyboard.press("Tab");
  await expect(message).toBeFocused();
  await viewer.page.keyboard.press("Escape");
  await expect(profile).toBeHidden();
  await expect(author).toBeFocused();
});
