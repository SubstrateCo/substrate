import { conversation, expectChange, post, send, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("notifications paginate, filter unread, and mark individual and all items as read", async ({
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
  for (let index = 0; index < 25; index++) {
    await post(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      threadId: root.id,
      body: `Page reply ${index}`,
    });
  }
  const recipient = await client(account);
  await visit(recipient, undefined, "/notifications");
  const feed = recipient.page.getByRole("region", { name: "Notifications", exact: true });
  const rows = feed.getByRole("list", { name: "Notification activity" }).getByRole("listitem");
  await expect(rows.first()).toBeVisible();
  const pageSize = await rows.count();
  expect(pageSize).toBeGreaterThan(1);
  expect(pageSize).toBeLessThanOrEqual(20);
  const scroller = feed.getByRole("region", { name: "Notification feed" });
  expect(await scroller.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
    true,
  );
  const lastBounds = await rows.last().boundingBox();
  const scrollBounds = await scroller.boundingBox();
  expect(lastBounds!.y + lastBounds!.height).toBeLessThanOrEqual(
    scrollBounds!.y + scrollBounds!.height + 1,
  );
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(0);
  const firstHref = await rows.first().getByRole("link").getAttribute("href");
  await feed.getByRole("button", { name: "Next", exact: true }).click();
  await expect(feed.getByRole("status", { name: "Notification page" })).toContainText("Page 2");
  await expect(rows).toHaveCount(Math.min(pageSize, 25 - pageSize));
  await expect(rows.locator(`a[href="${firstHref}"]`)).toHaveCount(0);
  await feed.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(rows.first().getByRole("link")).toHaveAttribute("href", firstHref!);
  await feed.getByRole("tab", { name: "Unread", exact: true }).click();
  await expect(rows).toHaveCount(pageSize);
  await expect(rows.getByText("Unread", { exact: true })).toHaveCount(0);
  const readHref = await rows.first().getByRole("link").getAttribute("href");
  await rows.first().getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(rows.locator(`a[href="${readHref}"]`)).toHaveCount(0);
  await feed.getByRole("button", { name: "Mark all as read", exact: true }).click();
  await expect(feed.getByRole("heading", { name: "You’re all caught up" })).toBeVisible();
  await feed.getByRole("button", { name: "View all activity" }).click();
  await expect(rows).toHaveCount(pageSize);
  await expect(rows.getByRole("button", { name: "Mark as read", exact: true })).toHaveCount(0);
  await recipient.page.setViewportSize({ width: 1100, height: 600 });
  await expect.poll(() => rows.count()).toBeLessThan(pageSize);
  await expect(rows.first()).toBeVisible();
  expect(await scroller.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
    true,
  );
  await expect(feed.getByRole("status", { name: "Notification page" })).toContainText("Page 1");
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
