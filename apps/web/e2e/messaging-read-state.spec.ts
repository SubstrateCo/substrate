import {
  acceptCollaboration,
  conversationButton,
  post,
  test,
  visit,
} from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("ordinary DMs alert outside messaging and opening them persists the read position", async ({
  account,
  actors,
  client,
}) => {
  await post(account, "messaging/conversations", { kind: "channel", name: "general" });
  const dm = await post<{ id: string }>(account, "messaging/conversations", {
    kind: "dm",
    emails: [actors.sender.email],
    shareHistory: true,
  });
  await acceptCollaboration(actors.sender, dm.id);
  const recipient = await client(account);
  const { page } = recipient;
  await visit(recipient, undefined, "/tasks");
  const body = `An ordinary direct message ${dm.id}`;
  await post(actors.sender, "messaging/messages", { conversationId: dm.id, body });
  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await expect(
    apps.getByRole("link", { name: "Messages, unread messages", exact: true }),
  ).toBeVisible();
  await apps.getByRole("link", { name: /^Notifications/ }).click();
  await expect(
    page.getByRole("link", {
      name: `${actors.sender.name} sent you a direct message, unread`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(body, { exact: true })).toBeVisible();
  await apps.getByRole("link", { name: "Messages, unread messages", exact: true }).click();
  const row = conversationButton(page, actors.sender.name);
  await expect(row.getByLabel("1 unread message", { exact: true })).toBeVisible();
  await row.click();
  await expect(page.getByRole("article").filter({ hasText: body })).toBeVisible();
  await expect(row.getByLabel("1 unread message", { exact: true })).toHaveCount(0);
  await expect(apps.getByRole("link", { name: "Messages", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("article").filter({ hasText: body })).toBeVisible();
  await expect(row.getByLabel("1 unread message", { exact: true })).toHaveCount(0);
});
