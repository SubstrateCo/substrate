import { post, test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("person details keep the known name visible until the profile loads", async ({
  actors,
  client,
}) => {
  const channel = await post<{ id: string }>(actors.sender, "messaging/conversations", {
    kind: "channel",
    name: `profile-loading-${crypto.randomUUID()}`,
    private: true,
    emails: [actors.member.email],
  });
  const body = `Profile loading ${crypto.randomUUID()}`;
  await post(actors.member, "messaging/messages", { conversationId: channel.id, body });
  const user = await client(actors.sender);
  await visit(user, channel.id);

  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const delivered = Promise.withResolvers<void>();
  await user.page.route("**/api/v1/messaging/profiles?**", async (route) => {
    const response = await route.fetch();
    ready.resolve();
    await release.promise;
    try {
      await route.fulfill({ response });
    } finally {
      delivered.resolve();
    }
  });

  const message = user.page.getByRole("article").filter({ hasText: body });
  await message.getByRole("button", { name: actors.member.name, exact: true }).click();
  await ready.promise;
  const card = user.page.getByRole("dialog", { name: `${actors.member.name} profile` });
  try {
    await expect(
      card.getByRole("status", { name: `Loading details for ${actors.member.name}…` }),
    ).toBeVisible();
    await expect(card.getByText(actors.member.name, { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: "Message", exact: true })).toHaveCount(0);
    await expect(card.getByRole("link")).toHaveCount(0);
  } finally {
    release.resolve();
    await delivered.promise;
  }
  await expect(card.getByText(actors.member.email, { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Message", exact: true })).toBeVisible();
});
