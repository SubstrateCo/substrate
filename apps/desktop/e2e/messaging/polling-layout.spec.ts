import { test } from "../test-support/fixture.js";
import { reconnectRealtime } from "../test-support/realtime.js";
import { createChannel } from "./test-support.js";
import { expect } from "@playwright/test";

test("realtime resync keeps channel and thread message layouts stable", async ({ desktop }) => {
  await desktop.provision();
  const page = desktop.page;
  await createChannel(page, "stable-polling");
  const composer = page.getByRole("textbox", { name: "Message #stable-polling", exact: true });
  await composer.fill("Stable root");
  await composer.press("Enter");
  const channel = page.getByRole("region", { name: "stable-polling", exact: true });
  const root = channel.getByRole("article").filter({ hasText: "Stable root" });
  await expect(root).toBeVisible();
  await root.hover();
  await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  const reply = thread.getByRole("textbox", { name: "Reply in thread…", exact: true });
  await reply.fill("Stable reply");
  await reply.press("Enter");
  await expect(thread.getByRole("article").filter({ hasText: "Stable reply" })).toBeVisible();
  const logs = page.getByRole("log", { name: "Messages", exact: true });
  await expect(logs).toHaveCount(2);
  const before = await logs.evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return { y: box.y, height: box.height, scrollTop: node.scrollTop };
    }),
  );
  const refresh = await page.evaluateHandle(() => {
    const original = window.fetch;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocked = new Set<string>();
    window.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
      const input = args[0];
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.pathname === "/api/v1/messaging/messages") {
        blocked.add(url.searchParams.get("threadId") ?? "channel");
        await gate;
      }
      return original(...args);
    }, original);
    return {
      count: () => blocked.size,
      recover: () => {
        window.fetch = original;
        release();
      },
    };
  });
  try {
    await reconnectRealtime(page);
    await expect.poll(() => refresh.evaluate((control) => control.count())).toBe(2);
    await expect
      .poll(() =>
        logs.evaluateAll((nodes) =>
          nodes.map((node) => {
            const box = node.getBoundingClientRect();
            return { y: box.y, height: box.height, scrollTop: node.scrollTop };
          }),
        ),
      )
      .toEqual(before);
    await expect(page.getByText(/Refreshing (messages|replies)…/)).toHaveCount(0);
  } finally {
    await refresh.evaluate((control) => control.recover());
    await refresh.dispose();
  }
  await expect(thread.getByRole("article").filter({ hasText: "Stable reply" })).toBeVisible();
});
