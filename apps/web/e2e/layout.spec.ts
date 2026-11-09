import { conversation, post, send, test, visit } from "./test-support/fixtures";
import { expect, type Page } from "@playwright/test";

async function dragBy(page: Page, separator: string, distance: number) {
  const handle = page.getByRole("separator", { name: separator, exact: true });
  const box = await handle.boundingBox();
  if (!box) throw new Error(`${separator} is not visible.`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + distance, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
}

const width = async (page: Page, sidebar: string) =>
  Math.round(
    (await page.getByRole("complementary", { name: sidebar, exact: true }).boundingBox())?.width ??
      0,
  );

for (const page of [
  { path: "/tasks", sidebar: "Projects", separator: "Resize projects sidebar" },
  { path: "/dashboard", sidebar: "Conversations", separator: "Resize conversations sidebar" },
]) {
  test(`${page.sidebar} sidebar resizes within its limits and keeps its width after reload`, async ({
    actors,
    client,
  }) => {
    const sender = await client(actors.sender);
    await visit(sender, undefined, page.path);
    await expect.poll(() => width(sender.page, page.sidebar)).toBe(240);
    await dragBy(sender.page, page.separator, -400);
    await expect.poll(() => width(sender.page, page.sidebar)).toBe(180);
    await dragBy(sender.page, page.separator, 400);
    await expect.poll(() => width(sender.page, page.sidebar)).toBe(360);
    await dragBy(sender.page, page.separator, -60);
    await expect.poll(() => width(sender.page, page.sidebar)).toBe(300);
    await visit(sender, undefined, page.path);
    await expect.poll(() => width(sender.page, page.sidebar)).toBe(300);
  });
}

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
  });
}
