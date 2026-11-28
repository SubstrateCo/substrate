import { conversation, test, visit } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("notification settings save for the account and the workspace and survive a reload", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/settings/user/notifications");
  const preview = page.getByRole("combobox", { name: "Preview", exact: true });
  const sound = page.getByRole("switch", { name: "Sound", exact: true });
  const channels = page.getByRole("combobox", { name: "Channels", exact: true });
  await expect(preview).toHaveText("Hidden");
  await expect(channels).toHaveText("Mentions");

  await preview.click();
  await page.getByRole("option", { name: "Sender only", exact: true }).click();
  await expect(preview).toHaveText("Sender only");
  await sound.click();
  await expect(sound).not.toBeChecked();
  await expect(sound).toBeEnabled();
  await page.getByRole("switch", { name: "Schedule", exact: true }).click();
  await expect(page.getByRole("toolbar", { name: "Days with alerts" })).toBeVisible();
  await channels.click();
  await page.getByRole("option", { name: "All", exact: true }).click();
  await expect(channels).toHaveText("All");
  await expect(channels).toBeEnabled();

  await page.reload();
  await expect(preview).toHaveText("Sender only");
  await expect(sound).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Schedule", exact: true })).toBeChecked();
  await expect(channels).toHaveText("All");
});

test("a member sets a channel's own level and mute from the conversation menu", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const openSubmenu = async (name: string) => {
    await page.getByRole("button", { name: "Conversation actions", exact: true }).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  };
  await openSubmenu("Notifications");
  await expect(
    page.getByRole("menuitemradio", { name: "Default (Mentions)", exact: true }),
  ).toBeChecked();
  await page.getByRole("menuitemradio", { name: "Nothing", exact: true }).click();
  await page.keyboard.press("Escape");

  await openSubmenu("Mute");
  await page.getByRole("menuitemradio", { name: "1 hour", exact: true }).click();
  await page.keyboard.press("Escape");

  await page.reload();
  await openSubmenu("Notifications");
  await expect(page.getByRole("menuitemradio", { name: "Nothing", exact: true })).toBeChecked();
  await page.keyboard.press("Escape");
  await openSubmenu("Muted");
  await expect(page.getByText(/^Muted until /)).toBeVisible();
});
