import { switchWorkspace } from "../../../web/e2e/test-support/organizations.js";
import { test } from "../test-support/fixture.js";
import { reconnectRealtime } from "../test-support/realtime.js";
import { createChannel } from "./test-support.js";
import { expect } from "@playwright/test";

test("same-workspace replies notify live, navigate to the reply and retain read state", async ({
  desktop,
  desktopPeer,
}) => {
  test.setTimeout(180_000);
  desktopPeer.owner.name = "Desktop Teammate";
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  const page = desktop.page;
  const peer = desktopPeer.page;
  const origin = desktop.rendererOrigin;
  const invited = await desktop.browser.request.post("/api/auth/organization/invite-member", {
    headers: { origin },
    data: { email: desktopPeer.owner.email, role: "member" },
  });
  expect(invited.ok()).toBe(true);
  const invitation = await invited.json();
  const accepted = await desktopPeer.browser.request.post(
    "/api/auth/organization/accept-invitation",
    {
      headers: { origin },
      data: { invitationId: invitation.id },
    },
  );
  expect(accepted.ok()).toBe(true);
  await peer.reload();
  await switchWorkspace(peer, desktopPeer.workspace, desktop.workspace);
  await Promise.all([reconnectRealtime(page), reconnectRealtime(peer)]);
  const privateChannel = await callMessaging<{ id: string }>(page, "createConversation", {
    kind: "channel",
    name: "owner-private-channel",
    private: true,
  });
  expect(privateChannel.error).toBeNull();
  const privateMessages = await callMessaging(peer, "listMessages", {
    conversationId: privateChannel.data!.id,
  });
  expect(privateMessages.errorCode).toBe("NOT_FOUND");
  await expect(
    peer.getByRole("button", { name: "owner-private-channel", exact: true }),
  ).toHaveCount(0);
  await createChannel(page, "live-team");
  await peer
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("button", { name: "live-team", exact: true })
    .click();
  const composer = page.getByRole("textbox", { name: "Message #live-team", exact: true });
  await composer.fill("Team thread root");
  await composer.press("Enter");
  const root = peer.getByRole("article").filter({ hasText: "Team thread root" });
  await expect(root).toBeVisible();
  await root.hover();
  await root.getByRole("button", { name: "Reply in thread", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  const notifications = page.getByRole("region", { name: "Notifications", exact: true });
  await expect(notifications.getByText("No notifications yet", { exact: true })).toBeVisible();
  const reply = peer.getByRole("textbox", { name: "Reply in thread…", exact: true });
  await reply.fill("Realtime notification reply");
  await reply.press("Enter");
  const item = notifications.getByRole("listitem").filter({ hasText: "New thread reply" });
  await expect(item).toBeVisible();
  await expect(notifications.getByRole("button", { name: /^Unread/ })).toHaveText("Unread 1");
  await item.getByRole("link").click();
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(
    thread.getByRole("article").filter({ hasText: "Realtime notification reply" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(item.getByText("Read", { exact: true })).toBeVisible();
  await expect(notifications.getByRole("button", { name: /^Unread/ })).toHaveText("Unread 0");
  await reconnectRealtime(page);
  await expect(item.getByText("Read", { exact: true })).toBeVisible();

  await test.step("shared project tasks, comments and access revocation update the other Electron app", async () => {
    await desktop.openPath("/tasks");
    await page.getByRole("button", { name: "New project", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill("Live team project");
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Live team project", exact: true }),
    ).toBeVisible();
    const projectURL = new URL(page.url());
    await desktopPeer.openPath("/tasks");
    await expect(
      peer.getByRole("button", { name: `${desktop.workspace} ▾`, exact: true }),
    ).toBeVisible();
    await expect(peer.getByRole("heading", { name: "Live team project", exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    const sharing = page.getByRole("region", { name: "Project sharing", exact: true });
    await sharing.getByRole("button", { name: "Add access", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Add project access", exact: true });
    await dialog
      .getByRole("combobox", { name: "Search people", exact: true })
      .fill("Desktop Teammate");
    await dialog.getByRole("option", { name: "Desktop Teammate", exact: true }).click();
    await dialog.getByRole("button", { name: "Review access", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Review access change", exact: true })
      .getByRole("button", { name: "Confirm access", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Review access change", exact: true }),
    ).toHaveCount(0);
    const shared = await peer.evaluate(async (projectEntityId) => {
      const session = await (await fetch("/api/v1/session")).json();
      const query = new URLSearchParams({
        organizationId: session.data.session.activeOrganizationId,
        projectEntityId: projectEntityId!,
      });
      return (await fetch(`/api/v1/tasks/project?${query}`)).json();
    }, projectURL.searchParams.get("projectId"));
    expect(shared.success, "The native viewer session has the new project grant").toBe(true);
    await expect(
      peer.getByRole("button", { name: "Live team project", exact: true }),
    ).toBeVisible();
    await peer.getByRole("button", { name: "Live team project", exact: true }).click();
    await expect(
      peer.getByRole("heading", { name: "Live team project", exact: true }),
    ).toBeVisible();
    const result = await page.evaluate(async (projectEntityId) => {
      const session = await (await fetch("/api/v1/session")).json();
      const response = await fetch("/api/v1/tasks/mutations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createTask",
          organizationId: session.data.session.activeOrganizationId,
          projectEntityId,
          title: "Live shared task",
        }),
      });
      return response.json();
    }, projectURL.searchParams.get("projectId"));
    expect(result.success).toBe(true);
    const taskButton = peer
      .getByRole("region", { name: "Project tasks", exact: true })
      .getByRole("button")
      .filter({ hasText: "Live shared task" });
    await expect(taskButton).toBeVisible();
    await taskButton.click();
    const taskId = new URL(peer.url()).searchParams.get("taskId");
    const commented = await page.evaluate(
      async ({ projectEntityId, taskEntityId }) => {
        const session = await (await fetch("/api/v1/session")).json();
        return (
          await fetch("/api/v1/tasks/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "comment",
              organizationId: session.data.session.activeOrganizationId,
              projectEntityId,
              taskEntityId,
              body: "Comment from the other Electron app",
            }),
          })
        ).json();
      },
      { projectEntityId: projectURL.searchParams.get("projectId"), taskEntityId: taskId },
    );
    expect(commented.success).toBe(true);
    await expect(
      peer.getByText("Comment from the other Electron app", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Settings", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const row = sharing.getByRole("listitem").filter({ hasText: "Desktop Teammate" });
    await row.getByRole("combobox", { name: "Desktop Teammate permission", exact: true }).click();
    await page.getByRole("option", { name: "No access", exact: true }).click();
    await row.getByRole("button", { name: "Apply", exact: true }).click();
    await page
      .getByRole("dialog", { name: "Review access change", exact: true })
      .getByRole("button", { name: "Remove access", exact: true })
      .click();
    await expect(peer.getByRole("heading", { name: "Live shared task", exact: true })).toHaveCount(
      0,
    );
    await expect(
      peer.getByText("Comment from the other Electron app", { exact: true }),
    ).toHaveCount(0);
    const denied = await peer.evaluate(async (projectEntityId) => {
      const session = await (await fetch("/api/v1/session")).json();
      const query = new URLSearchParams({
        organizationId: session.data.session.activeOrganizationId,
        projectEntityId: projectEntityId!,
      });
      return (await fetch(`/api/v1/tasks/project?${query}`)).json();
    }, projectURL.searchParams.get("projectId"));
    expect(denied.success).toBe(false);
    expect(denied.data).toBeUndefined();
  });
});
import { callMessaging } from "../../../web/e2e/test-support/api.js";
