import { conversation, expectChange, post, send, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("notifications load older pages, filter unread, and mark individual and all items as read", async ({
  actors,
  client,
  account,
}) => {
  test.setTimeout(30_000);
  const channel = await conversation(actors.sender, [account.email], [account]);
  const root = await post<{ id: string }>(account, "messaging/messages", {
    conversationId: channel.id,
    body: "Paginated notifications",
  });
  for (let index = 0; index < 21; index++) {
    await post(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      threadId: root.id,
      body: `Page reply ${index}`,
    });
  }
  const recipient = await client(account);
  await visit(recipient, undefined, "/tasks");
  await expect(recipient.page.getByText("Loading workspace details…")).toHaveCount(0);
  await recipient.page
    .getByRole("navigation", { name: "Apps" })
    .getByRole("button", { name: /^Notifications/ })
    .click();
  const feed = recipient.page.getByRole("region", { name: "Notifications", exact: true });
  const rows = feed.getByRole("list", { name: "Notification activity" }).getByRole("listitem");
  await expect(rows).toHaveCount(20);
  // Each row names who acted and where, and quotes the reply.
  await expect(rows.first().getByRole("link")).toHaveAccessibleName(
    `${actors.sender.name} replied to a thread in ${channel.name}, unread`,
  );
  await expect(rows.first()).toContainText("Page reply 20");
  await feed.getByRole("button", { name: "Show older", exact: true }).click();
  await expect(rows).toHaveCount(21);
  await expect(feed.getByRole("button", { name: "Show older", exact: true })).toHaveCount(0);
  await feed.getByRole("radio", { name: "Unread", exact: true }).click();
  await expect(rows).toHaveCount(20);
  const readHref = await rows.first().getByRole("link").getAttribute("href");
  await rows.first().getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(rows.locator(`a[href="${readHref}"]`)).toHaveCount(0);
  await feed.getByRole("button", { name: "Mark all as read", exact: true }).click();
  await expect(feed.getByRole("heading", { name: "You’re all caught up" })).toBeVisible();
  await feed.getByRole("button", { name: "Show all", exact: true }).click();
  // The full feed keeps the older page it loaded, and every row in it is now read.
  await expect(rows).toHaveCount(21);
  await expect(rows.getByRole("button", { name: "Mark as read", exact: true })).toHaveCount(0);
});

for (const scope of ["same organization", "cross organization"] as const) {
  test(`thread replies deliver live notifications in the ${scope}`, async ({ actors, client }) => {
    const author = scope === "same organization" ? actors.member : actors.partner;
    const channel = await conversation(actors.sender, [author.email], [author]);
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
    const link = notice.getByRole("link");
    await expect(link).toHaveAccessibleName(
      `${actors.sender.name} replied to a thread in ${channel.name}, unread`,
    );
    await expect(notice).toContainText(reply);
    await expectChange(recipient, since, "notifications");
    await expect(
      recipient.page.getByRole("button", {
        name: "Notifications, unread notifications",
        exact: true,
      }),
    ).toBeVisible();
    await notice.getByRole("button", { name: "Mark as read", exact: true }).click();
    await expect(link).toHaveAccessibleName(
      `${actors.sender.name} replied to a thread in ${channel.name}`,
    );
    await expect(notice.getByRole("button", { name: "Mark as read", exact: true })).toHaveCount(0);
    await link.click();
    const thread = recipient.page.getByRole("complementary", { name: "Thread", exact: true });
    await expect(thread.getByText(reply, { exact: true })).toBeVisible();
    expect(new URL(recipient.page.url()).searchParams.get("workspaceId")).toBe(
      author.organizationId,
    );
    expect(new URL(recipient.page.url()).searchParams.get("conversationId")).toBe(channel.id);
    expect(new URL(recipient.page.url()).searchParams.get("messageId")).toBe(sent.id);
    await recipient.page.getByRole("button", { name: "Notifications", exact: true }).click();
    await expect(link).toHaveAccessibleName(
      `${actors.sender.name} replied to a thread in ${channel.name}`,
    );
  });
}
