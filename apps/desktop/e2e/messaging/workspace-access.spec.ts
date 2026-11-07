import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { joinWorkspace } from "../test-support/organizations.js";
import { reconnectRealtime } from "../test-support/realtime.js";
import { expect } from "@playwright/test";

test("native workspace replacement clears the old conversation and rejects writes using its old scope", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page } = desktop;
  const conversation = await callMessaging<{ id: string }>(page, "createConversation", {
    kind: "channel",
    name: "first-private",
    private: true,
  });
  expect(conversation.error).toBeNull();
  expect(
    (
      await callMessaging(page, "sendMessage", {
        conversationId: conversation.data!.id,
        body: "Workspace A private contents",
      })
    ).error,
  ).toBeNull();
  await desktop.openPath(`/dashboard?conversationId=${conversation.data!.id}`);
  await expect(page.getByRole("log")).toContainText("Workspace A private contents");
  const firstOrganizationId: string = await page.evaluate(
    async () => (await (await fetch("/api/v1/session")).json()).data.session.activeOrganizationId,
  );
  const changed = await page.evaluate(async (suffix) => {
    const response = await fetch("/api/auth/organization/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Second workspace", slug: `stale-${suffix}` }),
    });
    const organization = await response.json();
    const activated = await fetch("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId: organization.id }),
    });
    return response.ok && activated.ok;
  }, desktop.suffix);
  expect(changed).toBe(true);
  const second = await callMessaging<{ id: string }>(page, "createConversation", {
    kind: "channel",
    name: "second-private",
    private: true,
  });
  expect(second.error).toBeNull();
  expect(
    (
      await callMessaging(page, "sendMessage", {
        conversationId: second.data!.id,
        body: "Workspace B private contents",
      })
    ).error,
  ).toBeNull();
  await reconnectRealtime(page);
  await expect(
    page.getByRole("heading", { name: "Conversation unavailable or access denied.", exact: true }),
  ).toBeVisible();
  for (const text of ["Workspace A private contents", "Workspace B private contents"])
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  for (const [name, input] of [
    ["sendMessage", { conversationId: conversation.data!.id, body: "Rejected stale message" }],
    ["createConversation", { kind: "channel", name: "rejected-stale-channel" }],
  ] as const) {
    const result = await callMessaging(page, name, {
      ...input,
      organizationId: firstOrganizationId,
    });
    expect(result.error).toBe("Your active workspace changed. Reload this page to continue.");
  }
  await desktop.openPath(`/dashboard?conversationId=${second.data!.id}`);
  await expect(page.getByRole("log")).toContainText("Workspace B private contents");
  await expect(page.getByRole("log")).not.toContainText("Rejected stale message");
  await expect(
    page.getByRole("button", { name: "rejected-stale-channel", exact: true }),
  ).toHaveCount(0);
});

test("workspace membership revocation clears a cached private conversation", async ({
  desktop,
  desktopPeer,
}) => {
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  await joinWorkspace(desktop, desktopPeer);
  const { page } = desktop;
  const peer = desktopPeer.page;
  const conversation = await callMessaging<{ id: string }>(page, "createConversation", {
    kind: "channel",
    private: true,
    name: "revoked-group",
    emails: [desktopPeer.owner.email],
  });
  expect(conversation.error).toBeNull();
  expect(
    (
      await callMessaging(page, "sendMessage", {
        conversationId: conversation.data!.id,
        body: "Cached private group message",
      })
    ).error,
  ).toBeNull();
  await peer.getByRole("button", { name: "revoked-group", exact: true }).click();
  await expect(peer.getByRole("log")).toContainText("Cached private group message");
  const organizationId = await page.evaluate(
    async () => (await (await fetch("/api/v1/session")).json()).data.session.activeOrganizationId,
  );
  const removed = await desktop.browser.request.post("/api/auth/organization/remove-member", {
    headers: { origin: desktop.rendererOrigin },
    data: { organizationId, memberIdOrEmail: desktopPeer.owner.email },
  });
  expect(removed.ok()).toBe(true);
  await peer.bringToFront();
  await peer.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(peer.getByText("Cached private group message", { exact: true })).toHaveCount(0);
  await expect(peer.getByRole("log")).toHaveCount(0);
});
