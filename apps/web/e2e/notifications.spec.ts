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

test("single and grouped notifications share a feed and expand without eager or repeated detail requests", async ({
  actors,
  account,
  client,
}) => {
  test.setTimeout(60_000);
  await Promise.all(
    (
      [
        [actors.sender, "Maya Chen"],
        [actors.member, "Jordan Lee"],
        [actors.partner, "Sam Rivera"],
        [account, "Alex Morgan"],
      ] as const
    ).map(async ([actor, name]) => {
      expect((await actor.request.post("/api/auth/update-user", { data: { name } })).ok()).toBe(
        true,
      );
      actor.name = name;
    }),
  );
  const channel = await post<{ id: string }>(actors.sender, "messaging/conversations", {
    kind: "channel",
    name: "Launch planning",
    private: true,
    shareHistory: true,
    emails: [account.email, actors.member.email, actors.partner.email],
  });
  await acceptCollaboration(account, channel.id);
  await acceptCollaboration(actors.partner, channel.id);
  const root = (body: string) =>
    post<{ id: string }>(account, "messaging/messages", { conversationId: channel.id, body });
  const reply = (actor: typeof account, threadId: string, body: string) =>
    post<{ id: string }>(actor, "messaging/messages", {
      conversationId: channel.id,
      threadId,
      body,
    });
  const oldest = await root("Final copy review");
  await reply(actors.member, oldest.id, "The onboarding copy is approved. We’re ready to publish.");
  expect(
    (
      await account.request.post("/api/v1/context/notifications/read-all", {
        data: { organizationId: account.organizationId },
      })
    ).ok(),
  ).toBe(true);
  const smaller = await root("Customer interviews");
  await reply(actors.sender, smaller.id, "I’ve added the interview notes to the shared brief.");
  await reply(
    actors.sender,
    smaller.id,
    "Three customers asked for the same improvement. Let’s discuss it tomorrow.",
  );
  const single = await root("Design handoff");
  await reply(actors.partner, single.id, "The updated product screens are ready for your review.");
  const launch = await root("Launch checklist");
  await reply(
    actors.sender,
    launch.id,
    "The release checklist is ready. Can everyone check their section?",
  );
  await reply(actors.member, launch.id, "Support is ready. I’ve added the help centre links.");
  await reply(
    actors.partner,
    launch.id,
    "The final design review is complete. Everything looks good.",
  );
  const newest = await reply(
    actors.sender,
    launch.id,
    "We’re all set for Thursday. The final launch checklist is ready to review.",
  );
  const recipient = await client(account);
  await recipient.page.emulateMedia({ reducedMotion: "reduce" });
  let details = 0;
  recipient.page.on("response", (response) => {
    if (
      response.ok() &&
      new URL(response.url()).pathname === "/api/v1/context/notifications/events"
    )
      details++;
  });
  await visit(recipient, undefined, "/notifications");
  const list = recipient.page.getByRole("list", { name: "Notification activity", exact: true });
  await expect(list.getByRole("button", { name: "Show 4 events", exact: true })).toBeVisible();
  await expect(list.getByRole("link", { name: /Maya Chen and 2 others replied/ })).toBeVisible();
  await expect(list.getByRole("link")).toHaveCount(4);
  const timestampEdges = await list
    .locator(":scope > li > div time")
    .evaluateAll((times) => times.map((time) => Math.round(time.getBoundingClientRect().right)));
  expect(timestampEdges).toHaveLength(4);
  expect(new Set(timestampEdges).size).toBe(1);
  expect(details).toBe(0);
  await list.getByRole("button", { name: "Show 4 events", exact: true }).click();
  const events = list.getByRole("list", { name: "Group events" });
  await expect(events.getByRole("link")).toHaveCount(4);
  const expandedTimestampEdges = await list
    .locator("time")
    .evaluateAll((times) => times.map((time) => Math.round(time.getBoundingClientRect().right)));
  expect(expandedTimestampEdges).toHaveLength(8);
  expect(new Set(expandedTimestampEdges).size).toBe(1);
  await expect(events.locator(`a[href*="messageId=${newest.id}"]`)).toBeVisible();
  expect(details).toBe(1);
  await list.getByRole("button", { name: "Hide 4 events", exact: true }).click();
  await list.getByRole("button", { name: "Show 4 events", exact: true }).click();
  await expect(events.getByRole("link")).toHaveCount(4);
  expect(details).toBe(1);
  // Expansion is not a read action.
  await expect(list.getByText("4 unread", { exact: true })).toBeVisible();
  await list.getByRole("button", { name: "Hide 4 events", exact: true }).click();
  await recipient.page.setViewportSize({ width: 800, height: 900 });
  await expect(list.getByRole("link", { name: /Maya Chen and 2 others replied/ })).toBeVisible();
  expect(
    await recipient.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  const narrowTimestampEdges = await list
    .locator("time")
    .evaluateAll((times) => times.map((time) => Math.round(time.getBoundingClientRect().right)));
  expect(new Set(narrowTimestampEdges).size).toBe(1);
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
  // A busy thread still consumes just one place in the group page. Its last reply is the newest
  // activity, so it is sent after the others.
  await Promise.all(
    Array.from({ length: 21 }, (_, index) => reply(root.id, `Busy reply ${index}`)),
  );
  await reply(root.id, "Busy reply 21");
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
  await expect(rows.first()).toContainText("Busy reply 21");
  await expect(rows.first()).toContainText("23 events");
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
  expect(new URL(recipient.page.url()).searchParams.get("workspaceId")).toBe(author.organizationId);
  expect(new URL(recipient.page.url()).searchParams.get("conversationId")).toBe(channel.id);
  expect(new URL(recipient.page.url()).searchParams.get("messageId")).toBe(sent.id);
  await recipient.page
    .getByRole("navigation", { name: "Apps" })
    .getByRole("button", { name: /^Notifications/ })
    .click();
  await expect(link).toHaveAccessibleName(
    `${actors.sender.name} replied to a thread in ${channel.name}`,
  );
});
