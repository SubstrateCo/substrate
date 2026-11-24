import { conversation, post, test } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("a conversation with exactly one page of messages keeps them after Older messages", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  // The page size is 50, so the only signal that nothing is older is an empty older page.
  for (let index = 0; index < 50; index++)
    await post(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body: `History message ${index}`,
    });
  const viewer = await client(actors.sender);
  const search = new URLSearchParams({
    workspaceId: actors.sender.organizationId,
    conversationId: channel.id,
  });
  await viewer.page.goto(`/messages?${search}`);
  const older = viewer.page.getByRole("button", { name: "Older messages", exact: true });
  await older.click();
  await expect(older).toHaveCount(0);
  await expect(viewer.page.getByText("History message 0", { exact: true })).toBeVisible();
  await expect(viewer.page.getByText("History message 49", { exact: true })).toHaveCount(1);
  await expect(viewer.page.getByText(/No messages yet/)).toHaveCount(0);
});
