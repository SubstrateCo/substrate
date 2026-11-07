import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { createChannel } from "./test-support.js";
import { expect } from "@playwright/test";

test("Electron messaging cancels creation without mutations and keeps channel and thread drafts separate", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  const sidebar = page.getByRole("complementary", { name: "Conversations", exact: true });
  await createChannel(page, "draft-first");
  const first = page.getByRole("textbox", { name: "Message #draft-first", exact: true });
  await first.fill("Root message");
  await first.press("Enter");
  const root = page.getByRole("article").filter({ hasText: "Root message" });
  await expect(root).toBeVisible();
  await first.fill("First channel draft");

  let creations = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/messaging/conversations"
    )
      creations++;
  });
  for (const kind of ["channel", "dm", "group"] as const) {
    const trigger = sidebar.getByRole("button", {
      name: kind === "channel" ? "Create channel" : "New message",
      exact: true,
    });
    await trigger.click();
    if (kind !== "channel")
      await page
        .getByRole("menuitem", {
          name: kind === "dm" ? "New direct message" : "New group message",
          exact: true,
        })
        .click();
    if (kind !== "dm")
      await page
        .getByLabel(kind === "channel" ? "Channel name" : "Group name (optional)", {
          exact: true,
        })
        .fill("Discard this creation");
    await page
      .getByLabel(kind === "channel" ? "Add people (optional)" : "To", { exact: true })
      .fill("nobody@example.test");
    await expect(first).toHaveCount(0);
    if (kind === "dm") await page.keyboard.press("Escape");
    else {
      const cancel = page.getByRole("button", { name: "Cancel", exact: true });
      await cancel.focus();
      await cancel.press("Enter");
    }
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(first).toHaveValue("First channel draft");
  }
  expect(creations, "Cancel must not submit a conversation creation").toBe(0);
  const conversations = await callMessaging<unknown[]>(page, "listConversations");
  expect(conversations.error).toBeNull();
  expect(conversations.data).toHaveLength(1);

  await createChannel(page, "draft-second");
  const second = page.getByRole("textbox", { name: "Message #draft-second", exact: true });
  await expect(second).toHaveValue("");
  await second.fill("Second channel draft");
  await sidebar.getByRole("button", { name: "draft-first", exact: true }).click();
  await expect(first).toHaveValue("First channel draft");
  await root.hover();
  await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const reply = page.getByRole("textbox", { name: "Reply in thread…", exact: true });
  await expect(reply).toHaveValue("");
  await reply.fill("Thread-only draft");
  await page.getByRole("button", { name: "Close thread", exact: true }).click();
  await sidebar.getByRole("button", { name: "draft-second", exact: true }).click();
  await expect(second).toHaveValue("Second channel draft");
  await sidebar.getByRole("button", { name: "draft-first", exact: true }).click();
  await root.hover();
  await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
  await expect(reply).toHaveValue("Thread-only draft");
  await expect(first).toHaveValue("First channel draft");
  await reply.press("Enter");
  await expect(reply).toHaveValue("");
  await expect(
    page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByRole("article")
      .filter({ hasText: "Thread-only draft" }),
  ).toBeVisible();
  await expect(first).toHaveValue("First channel draft");
});
