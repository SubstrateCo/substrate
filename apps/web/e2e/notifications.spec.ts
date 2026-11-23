import {
  acceptCollaboration,
  conversation,
  expectChange,
  post,
  send,
  test,
  visit,
} from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("single and grouped notifications expand to the correct events without marking them read", async ({
  actors,
  account,
  client,
}) => {
  const channel = await post<{ id: string }>(actors.sender, "messaging/conversations", {
    kind: "channel",
    name: "Launch planning",
    private: true,
    shareHistory: true,
    emails: [account.email, actors.member.email],
  });
  await acceptCollaboration(account, channel.id);
  const root = (body: string) =>
    post<{ id: string }>(account, "messaging/messages", { conversationId: channel.id, body });
  const reply = (actor: typeof account, threadId: string, body: string) =>
    post<{ id: string }>(actor, "messaging/messages", {
      conversationId: channel.id,
      threadId,
      body,
    });
  const single = await root("Design handoff");
  const singleReply = await reply(
    actors.sender,
    single.id,
    "The updated product screens are ready for your review.",
  );
  const launch = await root("Launch checklist");
  await reply(
    actors.sender,
    launch.id,
    "The release checklist is ready. Can everyone check their section?",
  );
  const newest = await reply(
    actors.member,
    launch.id,
    "We’re all set for Thursday. The final launch checklist is ready to review.",
  );
  const recipient = await client(account);
  await recipient.page.emulateMedia({ reducedMotion: "reduce" });
  await visit(recipient, undefined, "/notifications");
  const list = recipient.page.getByRole("list", { name: "Notification activity", exact: true });
  await expect(
    list.getByRole("link", {
      name: `${actors.member.name} and 1 other replied to a thread in Launch planning, unread`,
    }),
  ).toBeVisible();
  await expect(list.locator(`a[href*="messageId=${singleReply.id}"]`)).toBeVisible();
  await list.getByRole("button", { name: "Show 2 events", exact: true }).click();
  const events = list.getByRole("list", { name: "Group events" });
  await expect(events.getByRole("link")).toHaveCount(2);
  await expect(events.locator(`a[href*="messageId=${newest.id}"]`)).toBeVisible();
  await list.getByRole("button", { name: "Hide 2 events", exact: true }).click();
  await expect(events).toHaveCount(0);
  await list.getByRole("button", { name: "Show 2 events", exact: true }).click();
  await expect(events.getByRole("link")).toHaveCount(2);
  // Expansion is not a read action.
  await expect(list.getByText("2 unread", { exact: true })).toBeVisible();
});

test("notifications page complete groups, filter unread, and mark groups and all items as read", async ({
  actors,
  client,
  account,
}) => {
  test.setTimeout(60_000);
  const channel = await conversation(actors.sender, [account.email], [account]);
  const root = await post<{ id: string }>(account, "messaging/messages", {
    conversationId: channel.id,
    body: "Paginated notifications",
  });
  const reply = (threadId: string, body: string) =>
    post(actors.sender, "messaging/messages", { conversationId: channel.id, threadId, body });
  // 21 threads with a reply each fill one group page and start a second. Their order does not
  // matter, so they are created together.
  const threads = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      post<{ id: string }>(account, "messaging/messages", {
        conversationId: channel.id,
        body: `Thread ${index + 1}`,
      }),
    ),
  );
  await Promise.all([
    reply(root.id, "Page reply 0"),
    ...threads.map((thread, index) => reply(thread.id, `Page reply ${index + 1}`)),
  ]);
  // One extra reply gives the newest row a group without testing event-page boundaries here.
  await reply(root.id, "Newest grouped reply");
  const recipient = await client(account);
  await visit(recipient, undefined, "/tasks");
  await expect(recipient.page.getByText("Loading workspace details")).toHaveCount(0);
  await recipient.page
    .getByRole("navigation", { name: "Apps" })
    .getByRole("link", { name: /^Notifications/ })
    .click();
  const feed = recipient.page.getByRole("region", { name: "Notifications", exact: true });
  const rows = feed.getByRole("list", { name: "Notification activity" }).getByRole("listitem");
  await expect(rows).toHaveCount(20);
  // Each row names who acted and where, and quotes the reply.
  await expect(rows.first().getByRole("link")).toHaveAccessibleName(
    `${actors.sender.name} replied to a thread in ${channel.name}, unread`,
  );
  await expect(rows.first()).toContainText("Newest grouped reply");
  await expect(rows.first()).toContainText("2 events");
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

test("thread replies deliver live notifications to another organization", async ({
  actors,
  client,
}) => {
  const author = actors.partner;
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
    send(sender.page, reply, "Reply in thread"),
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
    recipient.page.getByRole("link", {
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
  expect(new URL(recipient.page.url()).searchParams.get("workspaceId")).toBe(author.organizationId);
  expect(new URL(recipient.page.url()).searchParams.get("conversationId")).toBe(channel.id);
  expect(new URL(recipient.page.url()).searchParams.get("messageId")).toBe(sent.id);
  await recipient.page
    .getByRole("navigation", { name: "Apps" })
    .getByRole("link", { name: /^Notifications/ })
    .click();
  await expect(link).toHaveAccessibleName(
    `${actors.sender.name} replied to a thread in ${channel.name}`,
  );
});
