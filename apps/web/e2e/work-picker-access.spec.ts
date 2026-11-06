import { callMessaging } from "./api";
import { provisionVerifiedAccount } from "./auth";
import { Mailpit } from "./mailpit";
import { provisionWorkspace } from "./organizations";
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";

for (const action of ["Create task", "Link existing work"] as const) {
  test(`${action} hides cached work after access is denied and supports retry`, async ({
    page,
    request,
  }) => {
    const suffix = randomUUID().slice(0, 8);
    await page.clock.install();
    await provisionVerifiedAccount(page, new Mailpit(request), {
      name: "Picker access",
      email: `picker-${suffix}@example.test`,
      password: `Picker-${randomUUID()}!`,
    });
    await provisionWorkspace(page, `Picker ${suffix}`, `picker-${suffix}`);
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
    await page.goto(`/dashboard?conversationId=${conversation.data!.id}`);

    const title = `Private work ${suffix}`;
    const id = randomUUID();
    let denied = false;
    await page.route("**/api/v1/context/search", (route) =>
      route.fulfill({
        status: denied ? 403 : 200,
        json: denied
          ? { success: false, error: { code: "FORBIDDEN", message: "Access denied." } }
          : {
              success: true,
              data: [{ id, title, kind: action === "Create task" ? "project" : "task" }],
            },
      }),
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
    await open();
    if (action === "Create task") {
      await panel.getByRole("combobox", { name: "Destination project", exact: true }).click();
      await expect(page.getByRole("option", { name: title, exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
    } else {
      await expect(panel.getByRole("button", { name: `Link ${title}`, exact: true })).toBeVisible();
    }
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    denied = true;
    await page.clock.fastForward(30_001);
    await open();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel).not.toContainText(title);
    await expect(panel.getByRole("combobox", { name: "Destination project" })).toHaveCount(0);

    denied = false;
    await panel.getByRole("button", { name: "Try again", exact: true }).click();
    if (action === "Create task") {
      await panel.getByRole("combobox", { name: "Destination project", exact: true }).click();
      await expect(page.getByRole("option", { name: title, exact: true })).toBeVisible();
    } else {
      await expect(panel.getByRole("button", { name: `Link ${title}`, exact: true })).toBeVisible();
    }
  });
}
