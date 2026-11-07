import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { createChannel } from "../messaging/test-support.js";
import { test } from "../test-support/fixture.js";
import { disconnectRealtime, waitForRealtimeIdle } from "../test-support/realtime.js";
import { failRequestsAt } from "../test-support/request-failure.js";
import { expect } from "@playwright/test";

test("notifications center empty states and persist bulk mark-read across reload", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page, browser, member } = desktop;
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: /^Notifications/ })
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
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: "Messages", exact: true })
    .click();
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
  let firstMessageId = "";
  for (const body of ["First mention", "Second mention"]) {
    const sent = await callMessaging<{ id: string }>(browser, "sendMessage", {
      conversationId,
      body: `${body} @[person:${recipient.data[0].id}]`,
    });
    expect(sent.error).toBeNull();
    if (body === "First mention") firstMessageId = sent.data!.id;
  }
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: /^Notifications/ })
    .click();
  await expect(panel.getByRole("heading", { name: "Notifications", exact: true })).toHaveCSS(
    "font-size",
    "14px",
  );
  const unread = panel.getByRole("button", { name: /^Unread/ });
  await expect(unread).toHaveText("Unread 2");
  await waitForRealtimeIdle(page);
  await disconnectRealtime(page);
  let writes = 0;
  let notificationReads = 0;
  let documents = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/context/notifications/read")) writes++;
    if (
      request.method() === "GET" &&
      new URL(request.url()).pathname === "/api/v1/context/notifications"
    )
      notificationReads++;
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  });
  const first = panel.locator(`a[href*="messageId=${firstMessageId}"]`);
  const notificationURL = page.url();
  const failure = await page.evaluateHandle(failRequestsAt, "/api/v1/context/notifications/read");
  await first.click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /update notifications/ }),
  ).toBeVisible();
  await expect(page).toHaveURL(notificationURL);
  await expect(unread).toHaveText("Unread 2");
  await failure.evaluate((control) => control.recover());
  await failure.dispose();
  writes = 0;
  notificationReads = 0;
  await first.click();
  await expect(
    page.getByRole("article").filter({ hasText: "First mention" }).first(),
  ).toBeVisible();
  expect(writes).toBe(1);
  expect(notificationReads).toBe(1);
  expect(documents).toBe(0);
  expect(new URL(page.url()).searchParams.get("workspaceId")).toBe(
    membership.member.organizationId,
  );
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: /^Notifications/ })
    .click();
  await expect(unread).toHaveText("Unread 1");
  await expect(first.locator("..").getByText("Read", { exact: true })).toBeVisible();
  writes = 0;
  notificationReads = 0;
  await first.click();
  await expect(
    page.getByRole("article").filter({ hasText: "First mention" }).first(),
  ).toBeVisible();
  expect(writes).toBe(0);
  expect(notificationReads).toBe(0);
  expect(documents).toBe(0);
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: /^Notifications/ })
    .click();
  await expect(unread).toHaveText("Unread 1");
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
