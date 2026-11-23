import { conversation, post, test, visit } from "./test-support/fixtures";
import { expect, type Locator } from "@playwright/test";

async function expectFullWidth(markdown: Locator) {
  await expect(markdown).toBeVisible();
  const blocks = markdown.locator(":scope > :is(p, ul, ol, blockquote)");
  await expect(blocks).toHaveCount(4);
  for (const block of await blocks.all()) {
    await expect
      .poll(() =>
        block.evaluate((element) =>
          Math.abs(
            element.getBoundingClientRect().width -
              element.parentElement!.getBoundingClientRect().width,
          ),
        ),
      )
      .toBeLessThan(1);
  }
  expect(await markdown.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
}

test("message text fills the conversation and stays within wide and narrow threads", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  const paragraph = "Message text should use the space available in its own pane. ".repeat(8);
  const body = `${paragraph}\n\n- ${paragraph}\n\n1. ${paragraph}\n\n> ${paragraph}`;
  const root = await post<{ id: string }>(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body,
  });
  await post(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    threadId: root.id,
    body,
  });
  const sender = await client(actors.sender);
  await sender.page.setViewportSize({ width: 2400, height: 1000 });
  await visit(sender, channel.id);
  const timeline = sender.page.getByRole("log", { name: "Messages", exact: true });
  await expectFullWidth(timeline.locator("[data-slot=message-markdown]"));
  await timeline.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const thread = sender.page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(thread.locator("[data-slot=message-markdown]")).toHaveCount(2);
  for (const markdown of await thread.locator("[data-slot=message-markdown]").all()) {
    await expectFullWidth(markdown);
  }
  await sender.page.setViewportSize({ width: 640, height: 900 });
  for (const markdown of await thread.locator("[data-slot=message-markdown]").all()) {
    await expectFullWidth(markdown);
  }
  expect(
    await sender.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
});
