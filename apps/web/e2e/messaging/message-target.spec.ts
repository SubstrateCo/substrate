import { conversation, expectChange, post, test, visit } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("a reply permalink in a short thread shows every reply without a jump to latest", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: "Short thread root",
  });
  const first = await post<{ id: string }>(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    threadId: root.id,
    body: "Linked reply",
  });
  await post(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    threadId: root.id,
    body: "Newer reply",
  });
  const viewer = await client(actors.sender);
  await visit(viewer, channel.id, "/messages", { messageId: first.id });
  const thread = viewer.page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(thread.getByLabel("Linked message", { exact: true })).toContainText("Linked reply");
  await expect(thread.getByText("Newer reply", { exact: true })).toBeVisible();
  const editor = thread.getByRole("textbox", { name: "Reply in thread" });
  await editor.fill("Sent reply");
  await editor.press("Enter");
  await expect(thread.getByText("Sent reply", { exact: true })).toBeVisible();
  await expect(
    viewer.page.getByRole("button", { name: /^(Latest replies|Back to latest)$/ }),
  ).toHaveCount(0);
});

test("root and reply permalinks retain root reactions outside the timeline and refresh local and remote changes", async ({
  actors,
  client,
}) => {
  test.setTimeout(45_000);
  const channel = await conversation(actors.sender, [actors.member.email]);
  const react = async (messageId: string) => {
    const response = await actors.member.request.post("/api/v1/messaging/reactions", {
      data: { organizationId: actors.member.organizationId, messageId, emoji: "👍" },
    });
    expect(response.ok()).toBe(true);
  };
  // Each permalink gets its own thread, so one target's reactions cannot satisfy the other's checks.
  const targets: { target: "root" | "reply"; root: { id: string }; messageId: string }[] = [];
  for (const target of ["root", "reply"] as const) {
    const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body: `Reacted ${target} root ${channel.id}`,
    });
    const reply = await post<{ id: string }>(actors.member, "messaging/messages", {
      conversationId: channel.id,
      threadId: root.id,
      body: `First ${target} reply ${channel.id}`,
    });
    await react(root.id);
    targets.push({ target, root, messageId: target === "root" ? root.id : reply.id });
  }
  // Both roots fall outside the latest timeline page.
  await Promise.all(
    Array.from({ length: 51 }, (_, index) =>
      post(actors.sender, "messaging/messages", {
        conversationId: channel.id,
        body: `Later message ${index}`,
      }),
    ),
  );
  const viewer = await client(actors.sender);
  let live = false;
  // Suppress change hints first: the local mutation must refresh the target itself.
  await viewer.page.routeWebSocket("**/api/v1/realtime?*", (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (live || JSON.parse(message.toString()).type !== "change") socket.send(message);
    });
  });
  for (const { target, root, messageId } of targets) {
    live = false;
    const search = new URLSearchParams({
      workspaceId: actors.sender.organizationId,
      conversationId: channel.id,
      messageId,
    });
    await viewer.page.goto(`/messages?${search}`);
    const rootBody = `Reacted ${target} root ${channel.id}`;
    const thread = viewer.page.getByRole("complementary", { name: "Thread", exact: true });
    const rootArticle = thread.getByRole("article").filter({ hasText: rootBody });
    const reaction = (count: number) =>
      rootArticle.getByRole("button", {
        name: `👍, ${count} ${count === 1 ? "reaction" : "reactions"}`,
        exact: true,
      });
    await expect(reaction(1)).toHaveAttribute("aria-pressed", "false");
    await viewer.page.getByRole("button", { name: "Back to latest", exact: true }).click();
    // Only the thread root remains; the latest timeline page cannot supply its summary.
    await expect(viewer.page.getByText(rootBody, { exact: true })).toHaveCount(1);
    await reaction(1).click();
    await expect(reaction(2)).toHaveAttribute("aria-pressed", "true");
    await reaction(2).click();
    await expect(reaction(1)).toHaveAttribute("aria-pressed", "false");
    live = true;
    const since = viewer.events.length;
    await react(root.id);
    await expectChange(viewer, since, "messaging", channel.id);
    await expect(reaction(1)).toHaveCount(0);
    await react(root.id);
    await expect(reaction(1)).toHaveAttribute("aria-pressed", "false");
  }
});
