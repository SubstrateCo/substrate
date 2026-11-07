import { switchWorkspace } from "../../../web/e2e/test-support/organizations.js";
import { test } from "../test-support/fixture.js";
import { holdAccessResponse } from "../test-support/realtime-access.js";
import {
  observeRealtime,
  reconnectRealtime,
  waitForRealtimeIdle,
} from "../test-support/realtime.js";
import { expect, type Page } from "@playwright/test";

const viewerName = "Access Edge Viewer";
const projectName = "Access edge private project";
const taskName = "Access edge private task";
const commentBody = "Access edge confidential comment";

async function grant(page: Page) {
  const sharing = page.getByRole("region", { name: "Project sharing", exact: true });
  await sharing.getByRole("button", { name: "Add access", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add project access", exact: true });
  await dialog.getByRole("combobox", { name: "Search people", exact: true }).fill(viewerName);
  await dialog.getByRole("option", { name: viewerName, exact: true }).click();
  await dialog.getByRole("button", { name: "Review access", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Review access change", exact: true })
    .getByRole("button", { name: "Confirm access", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Review access change", exact: true })).toHaveCount(
    0,
  );
}

async function revoke(page: Page) {
  const row = page
    .getByRole("region", { name: "Project sharing", exact: true })
    .getByRole("listitem")
    .filter({ hasText: viewerName });
  await row.getByRole("combobox", { name: `${viewerName} permission`, exact: true }).click();
  await page.getByRole("option", { name: "No access", exact: true }).click();
  await row.getByRole("button", { name: "Apply", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Review access change", exact: true })
    .getByRole("button", { name: "Remove access", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Review access change", exact: true })).toHaveCount(
    0,
  );
}

async function mutate(
  page: Page,
  data: {
    action: "createTask" | "comment";
    projectEntityId: string;
    taskEntityId?: string;
    title?: string;
    body?: string;
    assigneeActorEntityId?: string;
  },
) {
  const result = await page.evaluate(async (data) => {
    const session = await (await fetch("/api/v1/session")).json();
    return (
      await fetch("/api/v1/tasks/mutations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          organizationId: session.data.session.activeOrganizationId,
        }),
      })
    ).json();
  }, data);
  expect(result.success).toBe(true);
}

async function expectPrivateGone(page: Page) {
  await expect(page.getByRole("button", { name: projectName, exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: projectName, exact: true })).toHaveCount(0);
  await expect(page.getByText(taskName, { exact: true })).toHaveCount(0);
  await expect(page.getByText(commentBody, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Loading project", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Loading comments", exact: true })).toHaveCount(0);
}

async function expectNativeDenial(page: Page, projectEntityId: string, taskEntityId: string) {
  const results = await page.evaluate(
    async ({ projectEntityId, taskEntityId }) => {
      const session = await (await fetch("/api/v1/session")).json();
      const organizationId = session.data.session.activeOrganizationId;
      const project = new URLSearchParams({ organizationId, projectEntityId });
      const comments = new URLSearchParams({ organizationId, projectEntityId, taskEntityId });
      return Promise.all(
        [`/api/v1/tasks/project?${project}`, `/api/v1/tasks/comments?${comments}`].map(
          async (url) => (await fetch(url)).json(),
        ),
      );
    },
    { projectEntityId, taskEntityId },
  );
  for (const result of results) {
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
  }
}

// Use both real Electron sessions, including their native authorization bridge.
test.beforeEach(async ({ desktop, desktopPeer }) => {
  test.setTimeout(180_000);
  desktopPeer.owner.name = viewerName;
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  const invited = await desktop.browser.request.post("/api/auth/organization/invite-member", {
    headers: { origin: desktop.rendererOrigin },
    data: { email: desktopPeer.owner.email, role: "member" },
  });
  expect(invited.ok()).toBe(true);
  const invitation = await invited.json();
  const accepted = await desktopPeer.browser.request.post(
    "/api/auth/organization/accept-invitation",
    {
      headers: { origin: desktop.rendererOrigin },
      data: { invitationId: invitation.id },
    },
  );
  expect(accepted.ok()).toBe(true);
  await desktopPeer.page.reload();
  await switchWorkspace(desktopPeer.page, desktopPeer.workspace, desktop.workspace);
  await desktop.openPath("/tasks");
  await desktopPeer.openPath("/tasks");
  await Promise.all([reconnectRealtime(desktop.page), reconnectRealtime(desktopPeer.page)]);
  await desktop.page.getByRole("button", { name: "New project", exact: true }).click();
  await desktop.page.getByLabel("Project name", { exact: true }).fill(projectName);
  await desktop.page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(desktop.page.getByRole("heading", { name: projectName, exact: true })).toBeVisible();
  await waitForRealtimeIdle(desktop.page);
  await desktop.page.getByRole("tab", { name: "Settings", exact: true }).click();
  await grant(desktop.page);
  await expect(
    desktopPeer.page.getByRole("button", { name: projectName, exact: true }),
  ).toBeVisible();
  const projectEntityId = new URL(desktop.page.url()).searchParams.get("projectId")!;
  const assigneeActorEntityId = await desktop.page.evaluate(async (projectEntityId) => {
    const session = await (await fetch("/api/v1/session")).json();
    const query = new URLSearchParams({
      organizationId: session.data.session.activeOrganizationId,
      projectEntityId,
    });
    const project = await (await fetch(`/api/v1/tasks/project?${query}`)).json();
    return project.data.members.find(
      (member: { name: string }) => member.name === "Access Edge Viewer",
    ).actorEntityId;
  }, projectEntityId);
  await mutate(desktop.page, {
    action: "createTask",
    projectEntityId,
    title: taskName,
    assigneeActorEntityId,
  });
  await desktopPeer.page.getByRole("button", { name: projectName, exact: true }).click();
  const task = desktopPeer.page
    .getByRole("region", { name: "Project tasks", exact: true })
    .getByRole("button")
    .filter({ hasText: taskName });
  await expect(task).toBeVisible();
  await task.click();
  const taskEntityId = new URL(desktopPeer.page.url()).searchParams.get("taskId")!;
  await mutate(desktop.page, {
    action: "comment",
    projectEntityId,
    taskEntityId,
    body: commentBody,
  });
  await expect(desktopPeer.page.getByText(commentBody, { exact: true })).toBeVisible();
});

test("revocation clears private task content before a delayed successful comment response is released", async ({
  desktop,
  desktopPeer,
}) => {
  const page = desktop.page;
  const peer = desktopPeer.page;
  const projectEntityId = new URL(peer.url()).searchParams.get("projectId")!;
  const taskEntityId = new URL(peer.url()).searchParams.get("taskId")!;
  const observation = await observeRealtime(peer);
  const gate = await holdAccessResponse(peer, "/api/v1/tasks/comments", projectEntityId);
  try {
    await mutate(page, {
      action: "comment",
      projectEntityId,
      taskEntityId,
      body: "Trigger held comment refresh",
    });
    await gate.captured(commentBody);
    await expect(peer.getByText(commentBody, { exact: true })).toBeVisible();
    await revoke(page);
    await expect
      .poll(() =>
        observation.evaluate(({ events }) =>
          events.some((event) => event.type === "change" && event.domain === "access"),
        ),
      )
      .toBe(true);
    await expect(peer.getByText("Project unavailable", { exact: true })).toBeVisible();
    await expectPrivateGone(peer);
    await gate.release();
    await expectNativeDenial(peer, projectEntityId, taskEntityId);
    await expectPrivateGone(peer);
    await expect(peer.getByText("Trigger held comment refresh", { exact: true })).toHaveCount(0);
  } finally {
    await gate.restore();
    await observation.evaluate(({ stop }) => stop());
    await observation.dispose();
  }
});

test("rapid grant then revoke wins over the first blocked project refresh without restoring private metadata", async ({
  desktop,
  desktopPeer,
}) => {
  const page = desktop.page;
  const peer = desktopPeer.page;
  const projectEntityId = new URL(peer.url()).searchParams.get("projectId")!;
  const taskEntityId = new URL(peer.url()).searchParams.get("taskId")!;
  // Prove a real private notification exists before testing its removal.
  await peer
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: /^Notifications(?:, unread notifications)?$/ })
    .click();
  const notifications = peer.getByRole("region", { name: "Notifications", exact: true });
  await expect(notifications.getByText(taskName, { exact: true })).toBeVisible();
  await revoke(page);
  await expect(notifications.getByText(taskName, { exact: true })).toHaveCount(0);
  await desktopPeer.openPath(`/tasks?projectId=${projectEntityId}&taskId=${taskEntityId}`);
  await expect(peer.getByText("Project unavailable", { exact: true })).toBeVisible();
  const observation = await observeRealtime(peer);
  const gate = await holdAccessResponse(peer, "/api/v1/tasks/project", projectEntityId);
  try {
    await grant(page);
    await gate.captured(taskName);
    await expect
      .poll(() =>
        observation.evaluate(
          ({ events }) =>
            events.filter((event) => event.type === "change" && event.domain === "access").length,
        ),
      )
      .toBe(1);
    await revoke(page);
    await expect
      .poll(() =>
        observation.evaluate(
          ({ events }) =>
            events.filter((event) => event.type === "change" && event.domain === "access").length,
        ),
      )
      .toBe(2);
    await expect(peer.getByText("Project unavailable", { exact: true })).toBeVisible();
    await expectPrivateGone(peer);
    await gate.release();
    await expectNativeDenial(peer, projectEntityId, taskEntityId);
    await expectPrivateGone(peer);
    await peer
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("button", { name: /^Notifications(?:, unread notifications)?$/ })
      .click();
    await expect(notifications.getByText(taskName, { exact: true })).toHaveCount(0);
    await expect(notifications.getByText("No notifications yet", { exact: true })).toBeVisible();
    const nativeNotifications = await peer.evaluate(async () => {
      const session = await (await fetch("/api/v1/session")).json();
      const query = new URLSearchParams({
        organizationId: session.data.session.activeOrganizationId,
      });
      return (await fetch(`/api/v1/context/notifications?${query}`)).json();
    });
    expect(nativeNotifications.success).toBe(true);
    expect(nativeNotifications.data).toEqual([]);
  } finally {
    await gate.restore();
    await observation.evaluate(({ stop }) => stop());
    await observation.dispose();
  }
});
