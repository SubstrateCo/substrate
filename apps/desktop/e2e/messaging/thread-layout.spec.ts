import { test } from "../test-support/fixture.js";
import { reconnectRealtime, waitForRealtimeIdle } from "../test-support/realtime.js";
import { createChannel } from "./test-support.js";
import { expect, type Page } from "@playwright/test";

async function seedMessages(page: Page, count: number, start = 0, threadId?: string) {
  return page.evaluate(
    async ({ count, start, threadId }) => {
      const conversationId = new URL(location.href).searchParams.get("conversationId")!;
      const session = await (await fetch("/api/v1/session")).json();
      const organizationId = session.data.session.activeOrganizationId;
      const ids: string[] = [];
      for (let index = 0; index < count; index++) {
        const result = await (
          await fetch("/api/v1/messaging/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              organizationId,
              conversationId,
              threadId,
              body: `Window ${threadId ? "reply" : "root"} ${(start + index).toString().padStart(3, "0")}`,
            }),
          })
        ).json();
        if (!result.success) throw new Error(JSON.stringify(result));
        ids.push(result.data.id);
      }
      return ids;
    },
    { count, start, threadId },
  );
}

for (const older of [false, true]) {
  test(`opening an earlier thread preserves the ${older ? "older" : "latest"} channel window and scroll`, async ({
    desktop,
  }) => {
    await desktop.provision();
    const page = desktop.page;
    await createChannel(page, "thread-window");
    await seedMessages(page, older ? 65 : 12);
    const channel = page.getByRole("region", { name: "thread-window", exact: true });
    await expect(
      channel
        .getByRole("article")
        .filter({ hasText: older ? "Window root 064" : "Window root 011" }),
    ).toBeAttached();
    await expect(channel.getByRole("article")).toHaveCount(older ? 50 : 12);
    if (older) {
      await channel.getByRole("button", { name: "Older messages", exact: true }).click();
      await expect(channel.getByRole("article")).toHaveCount(15);
    }
    await expect(
      channel.getByRole("status", { name: "Loading linked work", exact: true }),
    ).toHaveCount(0);
    const root = channel.getByRole("article").filter({ hasText: "Window root 002" });
    await root.hover();
    const log = channel.getByRole("log", { name: "Messages", exact: true });
    const before = await log.evaluate((node) => ({
      text: node.textContent,
      scrollTop: node.scrollTop,
    }));
    await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
    await expect(page.getByRole("complementary", { name: "Thread", exact: true })).toBeVisible();
    await expect(channel.getByRole("article")).toHaveCount(older ? 15 : 12);
    // Exercise a real resync; idle workspaces no longer poll for messages.
    await expect.poll(() => page.url()).toContain("messageId=");
    await reconnectRealtime(page);
    await waitForRealtimeIdle(page);
    await expect
      .poll(() => log.evaluate((node) => ({ text: node.textContent, scrollTop: node.scrollTop })))
      .toEqual(before);
    if (!older) {
      await seedMessages(page, 1, 12);
      await expect(
        channel.getByRole("article").filter({ hasText: "Window root 012" }),
      ).toBeAttached();
      await expect(channel.getByRole("article")).toHaveCount(13);
    }
    await page.getByRole("button", { name: "Close thread", exact: true }).click();
    if (older) {
      await expect
        .poll(() => log.evaluate((node) => ({ text: node.textContent, scrollTop: node.scrollTop })))
        .toEqual(before);
    } else {
      await expect(channel.getByRole("article")).toHaveCount(13);
      await expect(
        channel.getByRole("article").filter({ hasText: "Window root 012" }),
      ).toBeAttached();
    }
    if (older) {
      await channel.getByRole("button", { name: "Back to latest", exact: true }).click();
      await expect(channel.getByRole("article")).toHaveCount(50);
      await expect(
        channel.getByRole("article").filter({ hasText: "Window root 064" }),
      ).toBeAttached();
    }
  });
}

test("an old-message desktop deep link loads context and Back to latest restores newer roots", async ({
  desktop,
}) => {
  await desktop.provision();
  const page = desktop.page;
  await createChannel(page, "deep-thread-window");
  const ids = await seedMessages(page, 65);
  const channel = page.getByRole("region", { name: "deep-thread-window", exact: true });
  await expect(channel.getByRole("article").filter({ hasText: "Window root 064" })).toBeAttached();
  await expect(channel.getByRole("article")).toHaveCount(50);
  const url = new URL(page.url());
  url.searchParams.set("messageId", ids[5]!);
  await desktop.openPath(`${url.pathname}${url.search}`);
  await expect(page.getByRole("complementary", { name: "Thread", exact: true })).toBeVisible();
  await expect(channel.getByRole("article").filter({ hasText: "Window root 005" })).toBeAttached();
  await expect(channel.getByRole("article").filter({ hasText: "Window root 004" })).toBeAttached();
  await channel.getByRole("button", { name: "Back to latest", exact: true }).click();
  await expect(channel.getByRole("article")).toHaveCount(50);
  await expect(channel.getByRole("article").filter({ hasText: "Window root 064" })).toBeAttached();
  await expect(channel.getByRole("button", { name: "Back to latest", exact: true })).toBeHidden();
  await reconnectRealtime(page);
  await waitForRealtimeIdle(page);
  await expect(channel.getByRole("article")).toHaveCount(50);
  await expect(channel.getByRole("article").filter({ hasText: "Window root 064" })).toBeAttached();
  await page.getByRole("button", { name: "Close thread", exact: true }).click();
  await expect(channel.getByRole("article")).toHaveCount(50);
});

test("an old-reply desktop deep link returns to exactly the latest replies in order", async ({
  desktop,
}) => {
  await desktop.provision();
  const page = desktop.page;
  await createChannel(page, "deep-reply-window");
  const [rootId] = await seedMessages(page, 1);
  const replies = await seedMessages(page, 65, 0, rootId!);
  const url = new URL(page.url());
  url.searchParams.set("messageId", replies[5]!);
  await desktop.openPath(`${url.pathname}${url.search}`);
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  const log = thread.getByRole("log", { name: "Messages", exact: true });
  await expect(log.getByRole("article").filter({ hasText: "Window reply 005" })).toBeAttached();
  await expect(log.getByRole("article").filter({ hasText: "Window reply 004" })).toBeAttached();
  await thread.getByRole("button", { name: "Latest replies", exact: true }).click();
  const latest = Array.from(
    { length: 50 },
    (_, index) => `Window reply ${(index + 15).toString().padStart(3, "0")}`,
  );
  await expect(log.locator(".message-markdown")).toHaveText(latest);
  await expect(log.getByRole("article").filter({ hasText: "Window reply 005" })).toHaveCount(0);
  await expect(thread.getByRole("button", { name: "Latest replies", exact: true })).toBeHidden();
  await reconnectRealtime(page);
  await waitForRealtimeIdle(page);
  await expect(log.locator(".message-markdown")).toHaveText(latest);
});
