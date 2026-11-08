import {
  conversation,
  expect,
  expectChange,
  post,
  send,
  test,
  visit,
} from "./test-support/fixtures";

for (const scope of ["same organization", "cross organization"] as const) {
  test(`thread replies deliver live notifications in the ${scope}`, async ({ actors, client }) => {
    const author = scope === "same organization" ? actors.member : actors.partner;
    const channel = await conversation(actors.sender, [author.email]);
    await post(author, "messaging/messages", {
      conversationId: channel.id,
      body: `Notification root ${channel.id}`,
    });
    const [sender, recipient] = await Promise.all([client(actors.sender), client(author)]);
    await Promise.all([visit(sender, channel.id), visit(recipient, undefined, "/notifications")]);
    const since = recipient.events.length;
    const reply = `Notification reply ${channel.id}`;
    await sender.page.getByRole("button", { name: "Reply in thread", exact: true }).click();
    const [response] = await Promise.all([
      sender.page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/v1/messaging/messages" &&
          response.request().method() === "POST",
      ),
      send(sender.page, reply, "Reply in thread…"),
    ]);
    expect(response.ok()).toBe(true);
    const { data: sent } = await response.json();
    const notice = recipient.page
      .getByRole("listitem")
      .filter({ has: recipient.page.locator(`a[href*="messageId=${sent.id}"]`) });
    await expect(notice.getByText("Replied to your thread", { exact: true })).toBeVisible();
    await expect(notice.getByText("Unread", { exact: true })).toBeVisible();
    await expectChange(recipient, since, "notifications");
    await expect(
      recipient.page.getByRole("button", {
        name: "Notifications, unread notifications",
        exact: true,
      }),
    ).toBeVisible();
    await notice.getByRole("button", { name: "Mark as read", exact: true }).click();
    await expect(notice.getByText("Read", { exact: true })).toBeVisible();
    await expect(notice.getByRole("button", { name: "Mark as read", exact: true })).toHaveCount(0);
    await notice.getByRole("link").click();
    const thread = recipient.page.getByRole("complementary", { name: "Thread", exact: true });
    await expect(thread.getByText(reply, { exact: true })).toBeVisible();
    expect(new URL(recipient.page.url()).searchParams.get("workspaceId")).toBe(
      author.organizationId,
    );
    expect(new URL(recipient.page.url()).searchParams.get("conversationId")).toBe(channel.id);
    expect(new URL(recipient.page.url()).searchParams.get("messageId")).toBe(sent.id);
    await recipient.page.getByRole("button", { name: "Notifications", exact: true }).click();
    await expect(notice.getByText("Read", { exact: true })).toBeVisible();
  });
}
