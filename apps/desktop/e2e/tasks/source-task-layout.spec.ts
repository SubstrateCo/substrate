import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { fitsWindow, resize } from "../test-support/layout.js";
import { callTasks } from "../test-support/tasks.js";
import { expect } from "@playwright/test";

for (const size of [
  { width: 1024, height: 768 },
  { width: 320, height: 568 },
]) {
  test(
    `source task controls and expanded context fit ${size.width}x${size.height}`,
    { tag: "@layout" },
    async ({ desktop }) => {
      await desktop.provision();
      const { page } = desktop;
      const project = "Layout " + "long-project-name-".repeat(8);
      await callTasks(page, { action: "createProject", name: project });
      const conversation = await callMessaging<{ id: string }>(page, "createConversation", {
        kind: "channel",
        name: "source-layout",
      });
      expect(conversation.error).toBeNull();
      const root = await callMessaging<{ id: string }>(page, "sendMessage", {
        conversationId: conversation.data!.id,
        body: "Thread root",
      });
      expect(root.error).toBeNull();
      const body = "Long source context without losing the thread. ".repeat(15).trim();
      expect(
        (
          await callMessaging(page, "sendMessage", {
            conversationId: conversation.data!.id,
            threadId: root.data!.id,
            body,
          })
        ).error,
      ).toBeNull();
      await desktop.openPath(
        `/dashboard?conversationId=${conversation.data!.id}&messageId=${root.data!.id}`,
      );
      await resize(desktop, size.width, size.height);
      const thread = page.getByRole("complementary", { name: "Thread", exact: true });
      const message = thread.getByRole("article").filter({ hasText: body });
      await message.hover();
      await message.getByRole("button", { name: "Create task", exact: true }).click();
      const builder = thread.getByRole("region", { name: "Create task from message", exact: true });
      await builder.getByRole("combobox", { name: "Destination project", exact: true }).click();
      await page.getByRole("option", { name: project, exact: true }).click();
      const form = builder.getByRole("form", { name: "New task", exact: true });
      if (size.width === 1024)
        expect(
          await form.evaluate((element) => element.getBoundingClientRect().height),
          "The collapsed desktop builder stays compact",
        ).toBeLessThan(520);
      await form
        .getByLabel("Task title", { exact: true })
        .fill("Layout " + "long title ".repeat(20));
      for (const name of ["Status", "Priority", "Assignee"]) {
        await form.getByRole("combobox", { name, exact: true }).click();
        await fitsWindow(page.getByRole("listbox"));
        await page.keyboard.press("Escape");
      }
      await form.getByText("Linked to this message", { exact: true }).click();
      await fitsWindow(form.locator("blockquote"));
      await fitsWindow(form.getByLabel("Due date", { exact: true }));
      for (const name of ["Create task", "Cancel"])
        await fitsWindow(form.getByRole("button", { name, exact: true }));
    },
  );
}
