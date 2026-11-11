import { acceptCollaboration, post, test, visit, type Actor } from "./test-support/fixtures";
import { expect } from "@playwright/test";

async function react(actor: Actor, messageId: string, emoji: string) {
  const response = await actor.request.post("/api/v1/messaging/reactions", {
    data: { organizationId: actor.organizationId, messageId, emoji },
  });
  expect(response.ok()).toBe(true);
}

test("reaction lists show reactors, filter by emoji, and reflect a removed reaction", async ({
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
  await visit(viewer, channel.id);
  const row = viewer.page
    .getByRole("article")
    .filter({ hasText: "The launch checklist is ready." });
  await expect(row.getByRole("button", { name: "👍, 4 reactions", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "More message actions" }).click();
  await viewer.page.getByRole("menuitem", { name: "View reactions", exact: true }).click();
  const dialog = viewer.page.getByRole("dialog", { name: "Reactions", exact: true });
  await expect(dialog.getByRole("listitem")).toHaveCount(4);
  await expect(dialog.getByLabel("Reactions", { exact: true })).toHaveCount(4);
  await dialog.getByRole("tab", { name: "❤️, 2", exact: true }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await expect(dialog.getByText(account.name, { exact: true })).toBeVisible();
  await expect(dialog.getByText("You", { exact: true })).toBeVisible();
  await viewer.page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await row.getByRole("button", { name: "❤️, 2 reactions", exact: true }).click();
  await expect(row.getByRole("button", { name: "❤️, 1 reaction", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await row.getByRole("button", { name: "More message actions" }).click();
  await viewer.page.getByRole("menuitem", { name: "View reactions", exact: true }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(4);
  await dialog.getByRole("tab", { name: "❤️, 1", exact: true }).click();
  await expect(dialog.getByRole("listitem")).toHaveCount(1);
  await expect(dialog.getByText(account.name, { exact: true })).toBeVisible();
});
