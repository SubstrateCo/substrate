import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { createChannel } from "../messaging/test-support.js";
import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("empty notifications are centered below the filters", async ({ desktop }) => {
  await desktop.provision();
  const { page } = desktop;
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Notifications", exact: true });
  for (const title of ["No notifications yet", "You’re all caught up"]) {
    if (title === "You’re all caught up")
      await panel.getByRole("button", { name: /^Unread/ }).click();
    const notice = panel.getByRole("status").filter({ hasText: title });
    await expect(notice).toBeVisible();
    const bounds = (await notice.boundingBox())!;
    const panelBounds = (await panel.boundingBox())!;
    const filters = (await panel
      .getByRole("group", { name: "Notification filter" })
      .boundingBox())!;
    expect(
      Math.abs(bounds.x + bounds.width / 2 - (panelBounds.x + panelBounds.width / 2)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        bounds.y +
          bounds.height / 2 -
          (filters.y + filters.height + panelBounds.y + panelBounds.height) / 2,
      ),
    ).toBeLessThanOrEqual(1);
  }
});

test("compact notifications mark all activity read and persist across reload", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page, browser, member } = desktop;
  await provisionVerifiedAccount(browser, desktop.mailpit, member);
  const invitation = await page.evaluate(async (email) => {
    const response = await fetch("/api/auth/organization/invite-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role: "member" }),
    });
    if (!response.ok) throw new Error("Could not invite notification sender");
    return response.json();
  }, member.email);
  const accepted = await browser.request.post("/api/auth/organization/accept-invitation", {
    headers: { origin: desktop.rendererOrigin },
    data: { invitationId: invitation.id },
  });
  expect(accepted.ok()).toBe(true);
  const membership = await accepted.json();
  const active = await browser.request.post("/api/auth/organization/set-active", {
    headers: { origin: desktop.rendererOrigin },
    data: { organizationId: membership.member.organizationId },
  });
  expect(active.ok()).toBe(true);
  await createChannel(page, "notification-review");
  const conversationId = new URL(page.url()).searchParams.get("conversationId")!;
  const recipient = await page.evaluate(async (conversationId) => {
    const session = await (await fetch("/api/v1/session")).json();
    const response = await fetch("/api/v1/context/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: session.data.session.activeOrganizationId,
        conversationId,
        query: "Desktop Owner",
        kind: "person",
      }),
    });
    return response.json();
  }, conversationId);
  expect(recipient.success).toBe(true);
  expect(recipient.data).toHaveLength(1);
  for (const body of ["First mention", "Second mention"]) {
    const sent = await callMessaging(browser, "sendMessage", {
      conversationId,
      body: `${body} @[person:${recipient.data[0].id}]`,
    });
    expect(sent.error).toBeNull();
  }
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Notifications", exact: true });
  await expect(panel.getByRole("heading", { name: "Notifications", exact: true })).toHaveCSS(
    "font-size",
    "14px",
  );
  const unread = panel.getByRole("button", { name: /^Unread/ });
  await expect(unread).toHaveText("Unread 2");
  const allRead = panel.getByRole("button", { name: "Mark all as read", exact: true });
  await allRead.click();
  await expect(unread).toHaveText("Unread 0");
  await expect(allRead).toBeDisabled();
  await unread.click();
  await expect(panel.getByText("You’re all caught up", { exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(unread).toHaveText("Unread 0");
  await expect(panel.getByText("Read", { exact: true })).toHaveCount(2);
});
