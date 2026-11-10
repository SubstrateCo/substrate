import { conversation, expectChange, post, test } from "./test-support/fixtures";
import { expect } from "@playwright/test";

for (const target of ["root", "reply"] as const) {
  test(`${target} permalink retains root reactions outside the timeline and refreshes local and remote changes`, async ({
    actors,
    client,
  }) => {
    test.setTimeout(45_000);
    const channel = await conversation(actors.sender, [actors.member.email]);
    const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body: `Reacted root ${channel.id}`,
    });
    const reply = await post<{ id: string }>(actors.member, "messaging/messages", {
      conversationId: channel.id,
      threadId: root.id,
      body: `First reply ${channel.id}`,
    });
    const react = async () => {
      const response = await actors.member.request.post("/api/v1/messaging/reactions", {
        data: { organizationId: actors.member.organizationId, messageId: root.id, emoji: "👍" },
      });
      expect(response.ok()).toBe(true);
    };
    await react();
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
    const search = new URLSearchParams({
      workspaceId: actors.sender.organizationId,
      conversationId: channel.id,
      messageId: target === "root" ? root.id : reply.id,
    });
    await viewer.page.goto(`/dashboard?${search}`);
    const thread = viewer.page.getByRole("complementary", { name: "Thread", exact: true });
    const rootArticle = thread
      .getByRole("article")
      .filter({ hasText: `Reacted root ${channel.id}` });
    const reaction = (count: number) =>
      rootArticle.getByRole("button", { name: `👍, ${count} reactions`, exact: true });
    await expect(reaction(1)).toHaveAttribute("aria-pressed", "false");
    await viewer.page.getByRole("button", { name: "Back to latest", exact: true }).click();
    // Only the thread root remains; the latest timeline page cannot supply its summary.
    await expect(viewer.page.getByText(`Reacted root ${channel.id}`, { exact: true })).toHaveCount(
      1,
    );
    await reaction(1).click();
    await expect(reaction(2)).toHaveAttribute("aria-pressed", "true");
    await reaction(2).click();
    await expect(reaction(1)).toHaveAttribute("aria-pressed", "false");
    live = true;
    const since = viewer.events.length;
    await react();
    await expectChange(viewer, since, "messaging", channel.id);
    await expect(reaction(1)).toHaveCount(0);
    await react();
    await expect(reaction(1)).toHaveAttribute("aria-pressed", "false");
  });
}
