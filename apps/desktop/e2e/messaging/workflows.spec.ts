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
  const first = page.getByRole("textbox", { name: "Message #draft-first", exact: true });
  let creations = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/v1/messaging/conversations"
    )
      creations++;
  });
  const cancelCreations = async (populated: boolean) => {
    const before = creations;
    const empty = page.getByRole("heading", { name: "Your conversations start here", exact: true });
    if (!populated) await expect(empty).toBeVisible();
    for (const kind of ["channel", "dm", "group"] as const) {
      for (const exit of ["button", "keyboard", "escape"] as const) {
        let trigger = sidebar.getByRole("button", {
          name: kind === "channel" ? "Create channel" : "New message",
          exact: true,
        });
        if (kind === "channel" && !populated)
          trigger = page.getByRole("button", { name: "Create channel", exact: true }).last();
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
        if (populated) {
          await expect(first).toHaveCount(0);
          await expect(page.getByRole("log")).toHaveCount(0);
        }
        const cancel = page.getByRole("button", { name: "Cancel", exact: true });
        if (exit === "escape") await page.keyboard.press("Escape");
        else if (exit === "keyboard") {
          await cancel.focus();
          await cancel.press("Enter");
        } else await cancel.click();
        await expect(cancel).toHaveCount(0);
        await expect(trigger).toBeFocused();
        if (populated) await expect(first).toHaveValue("First channel draft");
        else await expect(empty).toBeVisible();
      }
    }
    await desktop.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(390, 844);
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(390);
    await page.getByRole("button", { name: "Show conversations", exact: true }).click();
    const mobileTrigger = sidebar.getByRole("button", { name: "New message", exact: true });
    await mobileTrigger.click();
    await page.getByRole("menuitem", { name: "New group message", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Group name (optional)", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(mobileTrigger).toBeFocused();
    if (populated) {
      await sidebar.getByRole("button", { name: "draft-first", exact: true }).click();
      await expect(first).toHaveValue("First channel draft");
    } else {
      await page.getByRole("button", { name: "Back to messages", exact: true }).click();
      const emptyDm = page.getByRole("button", { name: "New direct message", exact: true });
      await emptyDm.click();
      await page.keyboard.press("Escape");
      await expect(emptyDm).toBeFocused();
    }
    expect(creations, "Cancel must not submit a conversation creation").toBe(before);
    const conversations = await callMessaging<unknown[]>(page, "listConversations");
    expect(conversations.error).toBeNull();
    expect(conversations.data).toHaveLength(populated ? 1 : 0);
    await desktop.app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]!.setContentSize(1024, 768);
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1024);
  };

  await test.step("empty messaging cancels every creation kind and exit path", () =>
    cancelCreations(false));
  await createChannel(page, "draft-first");
  await first.fill("Root message");
  await first.press("Enter");
  const root = page.getByRole("article").filter({ hasText: "Root message" });
  await expect(root).toBeVisible();
  await first.fill("Another thread root");
  await first.press("Enter");
  const otherRoot = page.getByRole("article").filter({ hasText: "Another thread root" });
  await expect(otherRoot).toBeVisible();
  await first.fill("First channel draft");
  await test.step("populated messaging restores the draft after every cancellation", () =>
    cancelCreations(true));

  await createChannel(page, "draft-second");
  const second = page.getByRole("textbox", { name: "Message #draft-second", exact: true });
  await expect(second).toHaveValue("");
  await second.fill("Second channel draft");
  await sidebar.getByRole("button", { name: "draft-first", exact: true }).click();
  await expect(first).toHaveValue("First channel draft");
  const reply = page.getByRole("textbox", { name: "Reply in thread…", exact: true });
  for (const [message, draft] of [
    [root, "Thread-only draft"],
    [otherRoot, "Another thread draft"],
  ] as const) {
    await message.hover();
    await message.getByRole("button", { name: "Reply in thread", exact: true }).click();
    await expect(reply).toHaveValue("");
    await reply.fill(draft);
    await page.getByRole("button", { name: "Close thread", exact: true }).click();
  }
  for (const [message, draft] of [
    [root, "Thread-only draft"],
    [otherRoot, "Another thread draft"],
  ] as const) {
    await message.hover();
    await message.getByRole("button", { name: "Reply in thread", exact: true }).click();
    await expect(reply).toHaveValue(draft);
    await page.getByRole("button", { name: "Close thread", exact: true }).click();
  }
  await expect(first).toHaveValue("First channel draft");
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
