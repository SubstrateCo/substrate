import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

for (const action of ["Create task", "Link existing work"] as const) {
  test(`${action} hides cached work after access is denied and supports retry`, async ({
    desktop,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    await desktop.provision();
    const { page } = desktop;
    await page.clock.install();
    const conversation = await callMessaging<{ id: string }>(page, "createConversation", {
      kind: "channel",
      name: `picker-${suffix}`,
    });
    expect(conversation.error).toBeNull();
    const body = `Picker source ${suffix}`;
    const sent = await callMessaging(page, "sendMessage", {
      conversationId: conversation.data!.id,
      body,
    });
    expect(sent.error).toBeNull();
    await desktop.openPath(`/dashboard?conversationId=${conversation.data!.id}`);

    const title = `Private work ${suffix}`;
    const id = randomUUID();
    const search = await page.evaluateHandle(
      ({ id, title, kind }) => {
        const original = window.fetch;
        let denied = false;
        window.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
          const input = args[0];
          const url = new URL(input instanceof Request ? input.url : String(input), location.href);
          if (url.pathname === "/api/v1/context/search")
            return Response.json(
              denied
                ? { success: false, error: { code: "FORBIDDEN", message: "Access denied." } }
                : { success: true, data: [{ id, title, kind }] },
              { status: denied ? 403 : 200 },
            );
          return original(...args);
        }, original);
        return {
          setDenied: (value: boolean) => {
            denied = value;
          },
          restore: () => {
            window.fetch = original;
          },
        };
      },
      { id, title, kind: action === "Create task" ? "project" : "task" },
    );
    const message = page.getByRole("article").filter({ hasText: body });
    const open = async () => {
      await message.hover();
      await message.getByRole("button", { name: action, exact: true }).click();
    };
    const panel = page.getByRole("region", {
      name: action === "Create task" ? "Create task from message" : action,
      exact: true,
    });
    try {
      await open();
      if (action === "Create task") {
        await panel.getByRole("combobox", { name: "Destination project", exact: true }).click();
        await expect(page.getByRole("option", { name: title, exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
      } else {
        await expect(
          panel.getByRole("button", { name: `Link ${title}`, exact: true }),
        ).toBeVisible();
      }
      await panel.getByRole("button", { name: "Cancel", exact: true }).click();
      await search.evaluate((control) => control.setDenied(true));
      await page.clock.fastForward(30_001);
      await open();
      await expect(panel.getByRole("alert")).toBeVisible();
      await expect(panel).not.toContainText(title);
      await expect(panel.getByRole("combobox", { name: "Destination project" })).toHaveCount(0);

      await search.evaluate((control) => control.setDenied(false));
      await panel.getByRole("button", { name: "Try again", exact: true }).click();
      if (action === "Create task") {
        await panel.getByRole("combobox", { name: "Destination project", exact: true }).click();
        await expect(page.getByRole("option", { name: title, exact: true })).toBeVisible();
      } else {
        await expect(
          panel.getByRole("button", { name: `Link ${title}`, exact: true }),
        ).toBeVisible();
      }
    } finally {
      await search.evaluate((control) => control.restore());
      await search.dispose();
    }
  });
}
