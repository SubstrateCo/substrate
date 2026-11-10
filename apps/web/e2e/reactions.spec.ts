import { acceptCollaboration, post, test, visit, type Actor } from "./test-support/fixtures";
import { expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

async function react(actor: Actor, messageId: string, emoji: string) {
  const response = await actor.request.post("/api/v1/messaging/reactions", {
    data: { organizationId: actor.organizationId, messageId, emoji },
  });
  expect(response.ok()).toBe(true);
}

test("reaction previews load on demand, overflow opens the full list, and clicks still toggle", async ({
  actors,
  account,
  client,
}) => {
  for (const [actor, name] of [
    [actors.sender, "Maya Chen"],
    [actors.member, "Alex Rivera"],
    [actors.partner, "Sam Patel"],
    [account, "Jordan Lee — Customer experience and launch operations"],
  ] as const) {
    expect((await actor.request.post("/api/auth/update-user", { data: { name } })).ok()).toBe(true);
    actor.name = name;
  }
  const channel = await post<{ id: string }>(actors.sender, "messaging/conversations", {
    kind: "channel",
    name: "Launch team",
    private: true,
    shareHistory: true,
    emails: [actors.member.email, actors.partner.email, account.email],
  });
  for (const actor of [actors.partner, account]) await acceptCollaboration(actor, channel.id);
  await post(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: "Final review is in. We’re looking good for launch.",
  });
  await post(actors.member, "messaging/messages", {
    conversationId: channel.id,
    body: "All checks passed on my side. Ready when you are.",
  });
  const message = await post<{ id: string }>(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: "The launch checklist is ready. Thanks for the thoughtful review, everyone!",
  });
  for (const actor of [actors.sender, actors.member, actors.partner, account])
    await react(actor, message.id, "👍");
  for (const actor of [actors.sender, account]) await react(actor, message.id, "❤️");
  const viewer = await client(actors.sender);
  const lookups: string[] = [];
  viewer.page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/v1/messaging/reactions" &&
      request.method() === "GET"
    )
      lookups.push(request.url());
  });
  await visit(viewer, channel.id);
  const row = viewer.page
    .getByRole("article")
    .filter({ hasText: "The launch checklist is ready." });
  await expect(row.getByRole("button", { name: "👍, 4 reactions", exact: true })).toBeVisible();
  expect(lookups).toEqual([]);

  const screenshots = process.env.REACTION_SCREENSHOTS;
  if (screenshots) await mkdir(screenshots, { recursive: true });
  for (const theme of ["light", "dark"] as const) {
    await viewer.page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await expect(viewer.page.locator("html")).toHaveClass(new RegExp(theme));
    await row.getByRole("button", { name: "❤️, 2 reactions", exact: true }).hover();
    const preview = viewer.page
      .locator('[data-slot="hover-card-content"]')
      .filter({ hasText: "2 people reacted" });
    await expect(preview.getByRole("listitem")).toHaveCount(2);
    await expect(preview.getByText("You", { exact: true })).toBeVisible();
    const longName = preview.getByText(account.name, { exact: true });
    await expect(longName).toBeVisible();
    expect(
      await longName.evaluate(
        (element) =>
          element.scrollWidth > element.clientWidth &&
          getComputedStyle(element).textOverflow === "ellipsis",
      ),
    ).toBe(true);
    expect(await preview.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await expect(preview.getByRole("button", { name: /View all/ })).toHaveCount(0);
    if (screenshots)
      await viewer.page.screenshot({
        path: join(screenshots, `reactions-standard-${theme}.png`),
        clip: { x: 296, y: 56, width: 1000, height: 540 },
      });

    await row.getByRole("button", { name: "👍, 4 reactions", exact: true }).hover();
    const overflow = viewer.page
      .locator('[data-slot="hover-card-content"]')
      .filter({ hasText: "4 people reacted" });
    await expect(overflow.getByRole("listitem")).toHaveCount(3);
    expect(await overflow.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await expect(overflow.getByRole("button", { name: /\+1 more.*View all/ })).toBeVisible();
    if (screenshots)
      await viewer.page.screenshot({
        path: join(screenshots, `reactions-overflow-${theme}.png`),
        clip: { x: 296, y: 56, width: 1000, height: 540 },
      });
    await overflow.getByRole("button", { name: /View all/ }).click();
    const dialog = viewer.page.getByRole("dialog", { name: "Reactions", exact: true });
    await expect(dialog.getByRole("listitem")).toHaveCount(4);
    if (screenshots)
      await viewer.page.screenshot({ path: join(screenshots, `reactions-dialog-${theme}.png`) });
    await dialog.getByRole("tab", { name: "All", exact: true }).click();
    await expect(dialog.getByRole("listitem")).toHaveCount(4);
    await expect(dialog.getByLabel("Reactions", { exact: true })).toHaveCount(4);
    if (screenshots)
      await viewer.page.screenshot({ path: join(screenshots, `reactions-all-${theme}.png`) });
    await dialog.getByRole("tab", { name: "❤️, 2", exact: true }).click();
    await expect(dialog.getByRole("listitem")).toHaveCount(2);
    await viewer.page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(row.getByRole("button", { name: "👍, 4 reactions", exact: true })).toBeFocused();
    await viewer.page.mouse.move(1200, 700);
    await row.getByRole("button", { name: "👍, 4 reactions", exact: true }).blur();
  }
  expect(lookups.every((url) => Number(new URL(url).searchParams.get("limit")) <= 25)).toBe(true);
  await row.getByRole("button", { name: "❤️, 2 reactions", exact: true }).click();
  await expect(row.getByRole("button", { name: "❤️, 1 reaction", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await row.getByRole("button", { name: "More message actions" }).click();
  await viewer.page.getByRole("menuitem", { name: "View reactions", exact: true }).click();
  const dialog = viewer.page.getByRole("dialog", { name: "Reactions" });
  await expect(dialog.getByRole("listitem")).toHaveCount(4);
  await viewer.page.setViewportSize({ width: 1440, height: 360 });
  const body = dialog.locator('[data-slot="dialog-body"]');
  await expect
    .poll(() => body.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(dialog.getByRole("heading", { name: "Reactions", exact: true })).toBeVisible();
  await expect(dialog.getByRole("tablist", { name: "Filter reactions" })).toBeVisible();
});
