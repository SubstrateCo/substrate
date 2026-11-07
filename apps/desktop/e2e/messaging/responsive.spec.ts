import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { fitsWindow, resize } from "../test-support/layout.js";
import { expect } from "@playwright/test";

for (const size of [
  { width: 1024, height: 768 },
  { width: 320, height: 568 },
]) {
  test(
    `messaging panels and actions fit ${size.width}x${size.height}`,
    { tag: "@layout" },
    async ({ desktop }) => {
      await desktop.provision();
      const { page } = desktop;
      const name = `layout-${"longchannelname".repeat(4)}`;
      const conversation = await callMessaging<{ id: string }>(page, "createConversation", {
        kind: "channel",
        name,
      });
      expect(conversation.error).toBeNull();
      const body = `Layout message ${"long".repeat(80)}`;
      const sent = await callMessaging(page, "sendMessage", {
        conversationId: conversation.data!.id,
        body,
      });
      expect(sent.error).toBeNull();
      await desktop.openPath(`/dashboard?conversationId=${conversation.data!.id}`);
      await resize(desktop, size.width, size.height);
      const sidebar = page.getByRole("complementary", { name: "Conversations", exact: true });
      if (size.width < 768) {
        await page.getByRole("button", { name: "Show conversations", exact: true }).click();
        await fitsWindow(sidebar);
        await sidebar.getByRole("button", { name, exact: true }).click();
        await expect(sidebar).toBeHidden();
      }
      const channel = page.getByRole("region", { name, exact: true });
      const composer = page.getByRole("textbox", { name: `Message #${name}`, exact: true });
      await fitsWindow(composer);
      const root = channel.getByRole("article").filter({ hasText: body });
      await expect
        .poll(() => root.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
        .toBe(true);
      await root.hover();
      for (const action of [
        "React to message",
        "Copy message link",
        "Create task",
        "Link existing work",
      ])
        await fitsWindow(root.getByRole("button", { name: action, exact: true }));
      await root.getByRole("button", { name: "React to message", exact: true }).click();
      const emoji = page.locator('[data-slot="popover-content"]');
      await fitsWindow(emoji);
      await fitsWindow(emoji.getByRole("button").last());
      await page.keyboard.press("Escape");
      await composer.fill("@");
      await fitsWindow(
        page.getByRole("region", { name: "Insert workspace reference", exact: true }),
      );
      await composer.press("Escape");
      await composer.fill("");
      await root.hover();
      await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
      const thread = page.getByRole("complementary", { name: "Thread", exact: true });
      await fitsWindow(thread);
      await fitsWindow(thread.getByRole("textbox", { name: "Reply in thread…", exact: true }));
      await fitsWindow(thread.getByRole("button", { name: "Send", exact: true }));
      await thread.getByRole("button", { name: "Close thread", exact: true }).click();
      await fitsWindow(composer);
      await channel.getByRole("button", { name: "Add people", exact: true }).click();
      await fitsWindow(page.getByLabel("Add people by exact email address", { exact: true }));
      await fitsWindow(page.getByRole("button", { name: "Add people", exact: true }).last());
    },
  );
}

test(
  "resizing across sidebar and thread breakpoints preserves the selected conversation and draft",
  { tag: "@layout" },
  async ({ desktop }) => {
    await desktop.provision();
    const { page } = desktop;
    const result = await callMessaging<{ id: string }>(page, "createConversation", {
      kind: "channel",
      name: "resize-layout",
    });
    expect(result.error).toBeNull();
    expect(
      (
        await callMessaging(page, "sendMessage", {
          conversationId: result.data!.id,
          body: "Resize root",
        })
      ).error,
    ).toBeNull();
    await desktop.openPath(`/dashboard?conversationId=${result.data!.id}`);
    const composer = page.getByRole("textbox", { name: "Message #resize-layout", exact: true });
    await composer.fill("Keep this draft");
    const sidebar = page.getByRole("complementary", { name: "Conversations", exact: true });
    await resize(desktop, 768, 768);
    await expect(sidebar).toBeVisible();
    await resize(desktop, 767, 768);
    await expect(sidebar).toBeHidden();
    await page.getByRole("button", { name: "Show conversations", exact: true }).click();
    await sidebar.getByRole("button", { name: "resize-layout", exact: true }).click();
    await expect(composer).toHaveText("Keep this draft");
    const root = page.getByRole("article").filter({ hasText: "Resize root" });
    await root.hover();
    await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
    const thread = page.getByRole("complementary", { name: "Thread", exact: true });
    const close = thread.getByRole("button", { name: "Close thread", exact: true });
    for (const width of [1024, 1023, 1024]) {
      await resize(desktop, width, 768);
      await expect(thread).toHaveCSS("position", width >= 1024 ? "static" : "absolute");
      await fitsWindow(close);
      if (width === 1023) await expect(close).toBeFocused();
    }
    await close.click();
    await expect(composer).toHaveText("Keep this draft");
  },
);
