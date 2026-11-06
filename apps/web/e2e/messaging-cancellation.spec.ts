import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { provisionVerifiedAccount } from "./auth";
import { Mailpit } from "./mailpit";
import { provisionWorkspace } from "./organizations";
import { callMessaging } from "./api";

for (const populated of [false, true]) {
  test(`real ${populated ? "populated" : "empty"} messaging cancels every creation kind without a mutation`, async ({
    page,
    request,
  }) => {
    const suffix = randomUUID();
    await provisionVerifiedAccount(page, new Mailpit(request), {
      name: "Cancel review",
      email: `cancel-${suffix}@example.test`,
      password: `Cancel-${suffix}!`,
    });
    await provisionWorkspace(page, `Cancel ${suffix}`, `cancel-${suffix}`);
    if (populated) {
      const created = await callMessaging(page, "createConversation", {
        kind: "channel",
        name: "general",
        emails: [],
        private: false,
      });
      expect(created.error).toBeNull();
      await page.reload();
      await expect(page.getByRole("heading", { name: "general", exact: true })).toBeVisible();
      await page
        .getByRole("textbox", { name: "Message #general", exact: true })
        .fill("Unsaved conversation draft");
    } else {
      await expect(
        page.getByRole("heading", { name: "Your conversations start here", exact: true }),
      ).toBeVisible();
    }
    let creations = 0;
    page.on("request", (transport) => {
      if (
        transport.method() === "POST" &&
        new URL(transport.url()).pathname === "/api/v1/messaging/conversations"
      )
        creations++;
    });
    for (const kind of ["channel", "dm", "group"]) {
      for (const exit of ["button", "keyboard", "escape"]) {
        const sidebar = page.getByRole("complementary", { name: "Conversations", exact: true });
        let trigger = sidebar.getByRole("button", { name: "New message", exact: true });
        if (kind === "channel") {
          trigger = sidebar.getByRole("button", { name: "Create channel", exact: true });
          if (!populated)
            trigger = page.getByRole("button", { name: "Create channel", exact: true }).last();
        }
        await trigger.click();
        if (kind !== "channel")
          await page
            .getByRole("menuitem", {
              name: kind === "dm" ? "New direct message" : "New group message",
              exact: true,
            })
            .click();
        if (populated) {
          await expect(
            page.getByRole("textbox", { name: "Message #general", exact: true }),
          ).toHaveCount(0);
          await expect(page.getByRole("log")).toHaveCount(0);
        }
        if (kind !== "dm")
          await page
            .getByLabel(kind === "channel" ? "Channel name" : "Group name (optional)", {
              exact: true,
            })
            .fill("Never create this");
        await page
          .getByLabel(kind === "channel" ? "Add people (optional)" : "To", { exact: true })
          .fill("nobody@example.test");
        const cancel = page.getByRole("button", { name: "Cancel", exact: true });
        if (kind === "channel" && exit === "button") {
          await page.screenshot({
            path: `C:/Users/mahar/AppData/Local/Temp/opencode/messaging-pass4-fixed-proof/actual-web-${populated ? "populated" : "empty"}-create-1280x720.png`,
          });
        }
        if (exit === "escape") await page.keyboard.press("Escape");
        else if (exit === "keyboard") {
          await cancel.focus();
          await cancel.press("Enter");
        } else await cancel.click();
        await expect(cancel).toHaveCount(0);
        await expect(trigger).toBeFocused();
        if (populated)
          await expect(
            page.getByRole("textbox", { name: "Message #general", exact: true }),
          ).toHaveValue("Unsaved conversation draft");
        else
          await expect(
            page.getByRole("heading", { name: "Your conversations start here", exact: true }),
          ).toBeVisible();
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Show conversations", exact: true }).click();
    const mobileTrigger = page.getByRole("button", { name: "New message", exact: true });
    await mobileTrigger.click();
    await page.getByRole("menuitem", { name: "New group message", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Group name (optional)", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(mobileTrigger).toBeFocused();
    if (populated) {
      await page.getByRole("button", { name: "general", exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "Message #general", exact: true }),
      ).toHaveValue("Unsaved conversation draft");
    } else {
      await page.getByRole("button", { name: "Back to messages", exact: true }).click();
      const emptyDm = page.getByRole("button", { name: "New direct message", exact: true });
      await emptyDm.click();
      await page.keyboard.press("Escape");
      await expect(emptyDm).toBeFocused();
    }
    expect(creations).toBe(0);
    await page.screenshot({
      path: `C:/Users/mahar/AppData/Local/Temp/opencode/messaging-pass4-fixed-proof/actual-web-${populated ? "populated" : "empty"}-return-390x844.png`,
    });
    const conversations = await callMessaging<unknown[]>(page, "listConversations");
    expect(conversations.error).toBeNull();
    expect(conversations.data).toHaveLength(populated ? 1 : 0);
  });
}
