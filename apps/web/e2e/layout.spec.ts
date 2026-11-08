import { conversation, expect, post, send, test, visit } from "./test-support/fixtures";
import { pauseClock } from "./test-support/search";

for (const width of [640, 1440]) {
  test(`messages and thread controls remain usable at ${width}px`, async ({ actors, client }) => {
    const channel = await conversation(actors.sender);
    await post(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body: `Layout root ${channel.id}`,
    });
    const sender = await client(actors.sender);
    await sender.page.setViewportSize({ width, height: 900 });
    await visit(sender, channel.id);
    const editor = sender.page.getByRole("textbox", { name: /^Message / });
    await expect(editor).toBeInViewport();
    await sender.page.getByRole("button", { name: "Reply in thread", exact: true }).click();
    const reply = `Layout reply ${channel.id}`;
    await expect(
      sender.page.getByRole("textbox", { name: "Reply in thread…", exact: true }),
    ).toBeInViewport();
    await send(sender.page, reply, "Reply in thread…");
    await expect(
      sender.page
        .getByRole("complementary", { name: "Thread", exact: true })
        .getByText(reply, { exact: true }),
    ).toBeVisible();
    await sender.page.getByRole("button", { name: "Close thread", exact: true }).click();
    await expect(editor).toBeInViewport();
    if (width < 768) {
      await sender.page.getByRole("button", { name: "Show conversations", exact: true }).click();
      await sender.page.getByRole("button", { name: channel.name, exact: true }).click();
      await expect(editor).toBeInViewport();
    }
    expect(
      await sender.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    if (width === 1440) {
      await pauseClock(sender.page);
      await sender.page.evaluate(() => {
        document.querySelector("main")!.dispatchEvent(new Event("scroll"));
      });
      const main = sender.page.locator("main");
      await expect(main).toHaveAttribute("data-scrolling", "");
      await sender.page.clock.runFor(400);
      await sender.page.evaluate(() => document.body.dispatchEvent(new Event("scroll")));
      await sender.page.clock.runFor(350);
      await expect(main).not.toHaveAttribute("data-scrolling");
      await expect(sender.page.locator("body")).toHaveAttribute("data-scrolling", "");
      await sender.page.clock.runFor(400);
      await expect(sender.page.locator("body")).not.toHaveAttribute("data-scrolling");
    }
  });
}
