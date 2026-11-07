import { callMessaging } from "../../../web/e2e/test-support/api.js";
import { test } from "../test-support/fixture.js";
import { callTasks } from "../test-support/tasks.js";
import { expect } from "@playwright/test";

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
