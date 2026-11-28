import { conversation, post, test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect } from "@playwright/test";

test("latest reactions stay fully visible without moving readers of older messages", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender, [actors.member.email]);
  for (let index = 0; index < 40; index++)
    await post(actors.sender, "messaging/messages", {
      conversationId: channel.id,
      body: `Reaction scroll message ${index}`,
    });
  const latest = await post<{ id: string }>(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: "Latest message awaiting a reaction",
  });
  const viewer = await client(actors.sender);
  await visit(viewer, channel.id);
  const { page } = viewer;
  const log = page.getByRole("log", { name: "Messages", exact: true });
  const row = log.getByRole("article").filter({ hasText: "Latest message awaiting a reaction" });
  const reaction = row.getByRole("button", { name: "👍, 1 reaction", exact: true });
  const bottomGap = () =>
    log.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight);
  await expect.poll(bottomGap).toBeLessThan(2);

  await row.hover();
  await row.getByRole("button", { name: "React with thumbs up", exact: true }).click();
  await expect(reaction).toHaveAttribute("aria-pressed", "true");
  await expect.poll(bottomGap).toBeLessThan(2);
  await expect
    .poll(() =>
      reaction.evaluate((node) => {
        const viewport = node.closest('[role="log"]')!.getBoundingClientRect();
        const chip = node.getBoundingClientRect();
        return chip.top >= viewport.top && chip.bottom <= viewport.bottom;
      }),
    )
    .toBe(true);

  await reaction.click();
  await expect(reaction).toHaveCount(0);
  await expect.poll(bottomGap).toBeLessThan(2);

  await log.evaluate((node) => {
    node.scrollTop -= 60;
  });
  await expect.poll(bottomGap).toBeGreaterThan(50);
  const react = () =>
    actors.member.request.post("/api/v1/messaging/reactions", {
      data: { organizationId: actors.member.organizationId, messageId: latest.id, emoji: "👍" },
    });
  expect((await react()).ok()).toBe(true);
  await expect(reaction).toHaveAttribute("aria-pressed", "false");
  await expect.poll(bottomGap).toBeLessThan(2);

  expect((await react()).ok()).toBe(true);
  await expect(reaction).toHaveCount(0);
  await log.evaluate((node) => {
    node.scrollTop = 120;
  });
  const jump = page.getByRole("button", { name: "Scroll to latest", exact: true });
  await expect(jump).toBeVisible();
  const readingPosition = await log.evaluate((node) => node.scrollTop);
  expect((await react()).ok()).toBe(true);
  await expect(reaction).toHaveCount(1);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await log.evaluate((node) => node.scrollTop)).toBe(readingPosition);
  await expect(row).not.toBeInViewport();
  await expect(page.getByRole("button", { name: "New messages", exact: true })).toHaveCount(0);

  await jump.click();
  await expect.poll(bottomGap).toBeLessThan(2);
  await expect(reaction).toBeInViewport({ ratio: 1 });
  await captureScreenshot(page, "messaging-latest-reaction-visible");
});
