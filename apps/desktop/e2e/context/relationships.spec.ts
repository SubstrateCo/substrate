import type { ServiceResult } from "@startup-os/contracts/result";

import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { joinWorkspace } from "../test-support/organizations.js";
import { observeRealtime, waitForRealtimeIdle } from "../test-support/realtime.js";
import { callTasks } from "../test-support/tasks.js";
import { expect } from "@playwright/test";

test("fifty message contexts load and refresh through one page request", async ({ desktop }) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const { page } = desktop;
  const project = await callTasks<{ id: string }>(page, {
    action: "createProject",
    name: "Page context project",
  });
  await desktop.openPath(`/tasks?projectId=${project.id}`);
  await expect(page).toHaveURL(/\/tasks\?/);
  const conversation = await callMessaging<{ id: string }>(page, "createConversation", {
    kind: "channel",
    name: "page-context",
  });
  expect(conversation.error).toBeNull();
  const unrelated = await callMessaging<{ id: string }>(page, "createConversation", {
    kind: "channel",
    name: "unrelated-page-context",
  });
  expect(unrelated.error).toBeNull();
  let rootId = "";
  for (let i = 0; i < 50; i++) {
    const sent = await callMessaging<{ id: string }>(page, "sendMessage", {
      conversationId: conversation.data!.id,
      body: `Page row ${i} @[project:${project.id}]`,
    });
    expect(sent.error).toBeNull();
    if (i === 49) rootId = sent.data!.id;
  }
  await waitForRealtimeIdle(page);
  const requests: string[] = [];
  const completed: string[] = [];
  const failed: string[] = [];
  page.on("request", (request) => {
    if (/\/context\/message-(page|links|people)(?:\?|$)/.test(request.url()))
      requests.push(new URL(request.url()).pathname);
  });
  page.on("response", (response) => {
    if (response.url().endsWith("/api/v1/context/message-page") && response.ok())
      completed.push(response.url());
  });
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/api/v1/context/message-page")) failed.push(request.url());
  });
  await page.getByRole("button", { name: "Messages", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Conversations", exact: true })
    .getByRole("button", { name: "page-context", exact: true })
    .click();
  const links = page
    .getByRole("article")
    .locator(".message-markdown")
    .getByRole("link", { name: "Page context project", exact: true });
  await expect(links).toHaveCount(50);
  await waitForRealtimeIdle(page);
  // Development StrictMode can abort and restart the initial mount request.
  expect(requests.length).toBeGreaterThanOrEqual(1);
  expect(requests.length).toBeLessThanOrEqual(2);
  expect(requests.every((path) => path === "/api/v1/context/message-page")).toBe(true);
  expect(completed).toHaveLength(1);
  expect(requests.length).toBe(completed.length + failed.length);
  requests.length = 0;
  completed.length = 0;
  failed.length = 0;
  const renamed = await page.evaluate(async (projectEntityId) => {
    const session = await (await fetch("/api/v1/session")).json();
    return (
      await fetch("/api/v1/tasks/mutations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateProject",
          organizationId: session.data.session.activeOrganizationId,
          projectEntityId,
          name: "Updated page project",
          description: "",
        }),
      })
    ).json();
  }, project.id);
  expect(renamed.success).toBe(true);
  await expect(
    page
      .getByRole("article")
      .locator(".message-markdown")
      .getByRole("link", { name: "Updated page project", exact: true }),
  ).toHaveCount(50);
  await waitForRealtimeIdle(page);
  expect(requests).toEqual(["/api/v1/context/message-page"]);
  expect(completed).toHaveLength(1);
  expect(failed).toHaveLength(0);
  requests.length = 0;
  const observation = await observeRealtime(page);
  try {
    const sent = await callMessaging(page, "sendMessage", {
      conversationId: unrelated.data!.id,
      body: "Unrelated conversation update",
    });
    expect(sent.error).toBeNull();
    await expect
      .poll(() =>
        observation.evaluate(
          ({ events }, id) =>
            events.some(
              (event) =>
                event.type === "change" &&
                event.domain === "messaging" &&
                event.conversationId === id,
            ),
          unrelated.data!.id,
        ),
      )
      .toBe(true);
    await waitForRealtimeIdle(page);
    expect(requests).toEqual([]);
  } finally {
    await observation.evaluate(({ stop }) => stop());
    await observation.dispose();
  }
  await page
    .getByRole("article")
    .filter({ hasText: "Page row 49" })
    .getByRole("button", { name: "Reply in thread", exact: true })
    .click();
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(thread.getByText("Page row 49", { exact: false })).toBeVisible();
  await expect(
    thread.getByRole("link", { name: "Updated page project", exact: true }),
  ).toBeVisible();
  await waitForRealtimeIdle(page);
  expect(requests).toEqual([]);
  const replied = await callMessaging(page, "sendMessage", {
    conversationId: conversation.data!.id,
    threadId: rootId,
    body: "Same conversation reply",
  });
  expect(replied.error).toBeNull();
  await expect(thread.getByText("Same conversation reply", { exact: true })).toBeVisible();
  await waitForRealtimeIdle(page);
  expect(requests.length).toBeGreaterThan(0);
  const fallback = page.waitForRequest(
    (request) =>
      request.url().endsWith("/api/v1/context/message-page") &&
      request.postDataJSON().messageIds.length === 1 &&
      request.postDataJSON().messageIds[0] === rootId,
  );
  const channel = page.getByRole("region", { name: "page-context", exact: true });
  await channel.getByRole("button", { name: "Older messages", exact: true }).click();
  await fallback;
  await expect(channel.getByRole("article")).toHaveCount(0);
  await expect(
    thread.getByRole("link", { name: "Updated page project", exact: true }),
  ).toBeVisible();
});

test("page context drops private work on a live access reset without hiding the message", async ({
  desktop,
  desktopPeer,
}) => {
  test.setTimeout(120_000);
  desktopPeer.owner.name = "Context Viewer";
  await Promise.all([desktop.provision(), desktopPeer.provision()]);
  await joinWorkspace(desktop, desktopPeer);
  const project = await callTasks<{ id: string }>(desktop.page, {
    action: "createProject",
    name: "Revocable context project",
  });
  const conversation = await callMessaging<{ id: string }>(desktop.page, "createConversation", {
    kind: "channel",
    name: "context-access",
  });
  expect(conversation.error).toBeNull();
  const people: ServiceResult<{ id: string }[]> = await desktop.page.evaluate(
    async (conversationId) => {
      const session = await (await fetch("/api/v1/session")).json();
      return (
        await fetch("/api/v1/context/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: session.data.session.activeOrganizationId,
            conversationId,
            kind: "person",
            query: "Context Viewer",
          }),
        })
      ).json();
    },
    conversation.data!.id,
  );
  expect(people.success).toBe(true);
  if (!people.success) throw new Error(people.error.message);
  expect(people.data).toHaveLength(1);
  const actorEntityId = people.data[0]!.id;
  const access = async (action: "share" | "revoke") => {
    const result = await desktop.page.evaluate(
      async ({ action, projectEntityId, actorEntityId }) => {
        const session = await (await fetch("/api/v1/session")).json();
        return (
          await fetch("/api/v1/tasks/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              organizationId: session.data.session.activeOrganizationId,
              projectEntityId,
              actorEntityId,
              level: action === "share" ? "view" : undefined,
            }),
          })
        ).json();
      },
      { action, projectEntityId: project.id, actorEntityId },
    );
    expect(result.success).toBe(true);
  };
  await access("share");
  const sent = await callMessaging<{ id: string }>(desktop.page, "sendMessage", {
    conversationId: conversation.data!.id,
    body: `Keep discussion visible @[project:${project.id}] @[person:${actorEntityId}]`,
  });
  expect(sent.error).toBeNull();
  await desktopPeer.openPath(`/dashboard?conversationId=${conversation.data!.id}`);
  const article = desktopPeer.page
    .getByRole("region", { name: "context-access", exact: true })
    .getByRole("article")
    .filter({ hasText: "Keep discussion visible" });
  await expect(
    article
      .locator(".message-markdown")
      .getByRole("link", { name: "Revocable context project", exact: true }),
  ).toBeVisible();
  await expect(
    article.locator(".message-markdown").getByText("Context Viewer", { exact: true }),
  ).toBeVisible();
  await waitForRealtimeIdle(desktopPeer.page);
  await article.getByRole("button", { name: "Reply in thread", exact: true }).click();
  const threadRoot = desktopPeer.page
    .getByRole("complementary", { name: "Thread", exact: true })
    .getByRole("article");
  await expect(
    threadRoot.getByRole("link", { name: "Revocable context project", exact: true }),
  ).toBeVisible();
  await access("revoke");
  await expect(article.getByText("Revocable context project", { exact: true })).toHaveCount(0);
  await expect(article.getByText("Unavailable reference", { exact: true })).toBeVisible();
  await expect(
    article.locator(".message-markdown").getByText("Context Viewer", { exact: true }),
  ).toBeVisible();
  await waitForRealtimeIdle(desktopPeer.page);
  await expect(article).toContainText("Keep discussion visible");
  await expect(article.getByRole("link")).toHaveCount(0);
  await expect(threadRoot.getByText("Unavailable reference", { exact: true })).toBeVisible();
  await expect(threadRoot.getByText("Revocable context project", { exact: true })).toHaveCount(0);
  await expect(threadRoot.getByRole("link")).toHaveCount(0);
});

test("explicit unlinking preserves provenance and typed references create navigable backlinks", async ({
  desktop,
}) => {
  await desktop.provision();
  const { page } = desktop;
  const project = "Relationship project";
  const title = "Relationship task";
  const source = "Keep the original source relationship";
  const { id: projectEntityId } = await callTasks<{ id: string }>(page, {
    action: "createProject",
    name: project,
  });
  const conversation = await callMessaging<{ id: string }>(page, "createConversation", {
    kind: "channel",
    name: "relationships",
  });
  expect(conversation.error).toBeNull();
  const message = await callMessaging<{ id: string }>(page, "sendMessage", {
    conversationId: conversation.data!.id,
    body: source,
  });
  expect(message.error).toBeNull();
  const created = await page.evaluate(
    async ({ projectEntityId, messageId, title }) => {
      const session = await (await fetch("/api/v1/session")).json();
      return (
        await fetch("/api/v1/context/source-tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: session.data.session.activeOrganizationId,
            projectEntityId,
            messageId,
            title,
            requestId: crypto.randomUUID(),
          }),
        })
      ).json();
    },
    { projectEntityId, messageId: message.data!.id, title },
  );
  expect(created.success).toBe(true);
  const conversationPath = `/dashboard?conversationId=${conversation.data!.id}`;
  await desktop.openPath(conversationPath);
  const article = page.getByRole("article").filter({ hasText: source });
  await article.hover();
  await article.getByRole("button", { name: "Link existing work", exact: true }).click();
  const linking = page.getByRole("region", { name: "Link existing work", exact: true });
  await linking.getByLabel("Search work to link", { exact: true }).fill(title);
  await linking.getByRole("button", { name: `Link ${title}`, exact: true }).click();
  await expect(article.getByText("Linked work", { exact: true })).toBeVisible();
  await article.getByRole("button", { name: `Unlink ${title}`, exact: true }).click();
  await page.reload();
  await expect(article.getByText("Linked work", { exact: true })).toBeHidden();
  await expect(article.getByText("Created here", { exact: true })).toBeVisible();
  await article.getByRole("link", { name: `Open ${title}`, exact: true }).click();
  const taskURL = page.url();
  await expect(page.getByRole("region", { name: "Related context", exact: true })).toContainText(
    source,
  );
  await desktop.openPath(conversationPath);
  const composer = page.getByRole("textbox", { name: "Message #relationships", exact: true });
  await composer.fill("References @");
  const picker = page.getByRole("region", { name: "Insert workspace reference", exact: true });
  const search = picker.getByRole("combobox", { name: "Search references", exact: true });
  await search.fill(title);
  await picker.getByRole("option", { name: title, exact: true }).click();
  await composer.press("End");
  await composer.pressSequentially("@");
  await picker.getByRole("tab", { name: "Projects", exact: true }).click();
  await search.fill(project);
  await expect(picker.getByRole("option", { name: project, exact: true })).toBeVisible();
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(composer).toBeFocused();
  await composer.press("Enter");
  const reference = page.getByRole("article").filter({ hasText: "References" });
  await expect(reference.getByRole("link", { name: title, exact: true }).first()).toBeVisible();
  await page.reload();
  await reference.getByRole("link", { name: project, exact: true }).first().click();
  await page.getByRole("tab", { name: "Discussions", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Project discussions", exact: true }),
  ).toContainText("References");
  await desktop.openPath(conversationPath);
  await reference.getByRole("link", { name: title, exact: true }).first().click();
  await expect(page).toHaveURL(taskURL);
  await page.keyboard.press("Control+k");
  const workspaceSearch = page.getByRole("region", { name: "Workspace search", exact: true });
  await page.getByRole("combobox", { name: "Search workspace", exact: true }).fill(title);
  await workspaceSearch.getByRole("button", { name: "Tasks", exact: true }).click();
  await workspaceSearch
    .getByRole("button", { name: `Find related records for ${title}`, exact: true })
    .click();
  await expect(
    workspaceSearch.getByRole("link", { name: `message · ${source}`, exact: true }),
  ).toBeVisible();
  await workspaceSearch
    .getByRole("button", { name: `Find related records for ${source}`, exact: true })
    .click();
  await expect(
    workspaceSearch.getByRole("link", { name: `task · ${title}`, exact: true }),
  ).toBeVisible();
});
