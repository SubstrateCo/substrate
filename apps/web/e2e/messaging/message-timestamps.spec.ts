import { conversation, post, test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect } from "@playwright/test";

test("message timestamps sit beside author names without repeating on grouped messages", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  for (const body of ["First timestamp message", "Grouped timestamp message"]) {
    await post(actors.sender, "messaging/messages", { conversationId: channel.id, body });
  }
  const sender = await client(actors.sender);
  await visit(sender, channel.id);
  const timeline = sender.page.getByRole("log", { name: "Messages", exact: true });
  const first = timeline.getByRole("article").filter({ hasText: "First timestamp message" });
  const grouped = timeline.getByRole("article", { name: `${actors.sender.name}, continued` });
  await expect(grouped).toContainText("Grouped timestamp message");
  await expect(first.locator("time")).toHaveText(/^(?:[1-9]|1[0-2]):[0-5]\d [AP]M$/);
  await expect(timeline.locator("time")).toHaveCount(1);
  await expect(grouped.getByText(actors.sender.name, { exact: true })).toHaveCount(0);

  for (const width of [1440, 640]) {
    await sender.page.setViewportSize({ width, height: 900 });
    await grouped.hover();
    await expect(grouped.locator("time")).toHaveCount(0);
    const layout = await grouped.evaluate((row) => {
      const gutter = row.querySelector("[data-slot=message-gutter]")!.getBoundingClientRect();
      const body = row.querySelector("[data-slot=message-markdown]")!.getBoundingClientRect();
      return {
        gutterWidth: gutter.width,
        gutterRight: gutter.right,
        bodyLeft: body.left,
      };
    });
    expect(layout.gutterWidth).toBe(36);
    expect(layout.bodyLeft - layout.gutterRight).toBeGreaterThanOrEqual(12);
    const firstBody = await first.locator("[data-slot=message-markdown]").boundingBox();
    expect(firstBody).not.toBeNull();
    expect(Math.abs(firstBody!.x - layout.bodyLeft)).toBeLessThan(1);

    const byline = await first.locator("time").evaluate((time) => {
      const previous = time.previousElementSibling!.getBoundingClientRect();
      const box = time.getBoundingClientRect();
      return { gap: box.left - previous.right, top: box.top, previousBottom: previous.bottom };
    });
    await expect(first.locator("time").locator("..")).toContainText(actors.sender.name);
    expect(byline.gap).toBeGreaterThanOrEqual(8);
    expect(byline.top).toBeLessThan(byline.previousBottom);
    await captureScreenshot(sender.page, `message-timestamps-${width}`);
  }
});
