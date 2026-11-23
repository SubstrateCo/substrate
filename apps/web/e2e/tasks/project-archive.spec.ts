import { post, test, visit } from "../test-support/fixtures";
import { project, share } from "../test-support/tasks";
import { expect } from "@playwright/test";

test("archive a project, open it read-only from Archived, and restore it", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  await post(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Archived work",
  });
  await share(actors.sender, created.entityId, actors.member.name, "edit");
  // An Archived group that is already there, closed, opens to show the newly archived project.
  const older = await project(actors.sender);
  await post(actors.sender, "tasks/mutations", {
    action: "archiveProject",
    organizationId: actors.sender.organizationId,
    projectEntityId: older.entityId,
  });
  const owner = await client(actors.sender);
  const { page } = owner;
  await visit(owner, undefined, "/tasks", { projectId: created.entityId });
  await expect(page.getByRole("button", { name: "New task", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  // Delete is offered only after the project is archived.
  await expect(page.getByRole("button", { name: "Delete project", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Archive project", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: `Archive “${created.name}”?`, exact: true });
  await expect(dialog).toContainText("comments, and linked messages");
  await expect(dialog).toContainText("until a project owner or admin restores it");
  await dialog.getByRole("button", { name: "Archive project", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  const notice = page.getByRole("status").filter({ hasText: "read-only" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/Archived by .+ on \w{3} \d{1,2}\. This project/);
  await expect(page.getByRole("button", { name: "New task", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete project", exact: true })).toBeVisible();
  const archived = page.getByRole("region", { name: "Archived projects", exact: true });
  await expect(archived.getByRole("link", { name: created.name, exact: true })).toBeVisible();

  // An editor's deep link opens the project read-only, without Restore.
  const editor = await client(actors.member);
  await visit(editor, undefined, "/tasks", { projectId: created.entityId });
  await expect(editor.page.getByRole("status").filter({ hasText: "read-only" })).toBeVisible();
  await expect(editor.page.getByRole("button", { name: "Restore project" })).toHaveCount(0);
  await expect(editor.page.getByRole("button", { name: "New task", exact: true })).toHaveCount(0);

  await notice.getByRole("button", { name: "Restore project", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New task", exact: true })).toBeVisible();
  await expect(archived.getByRole("link", { name: created.name, exact: true })).toHaveCount(0);
});

test("restore from the Archived list, and delete only an archived project", async ({
  actors,
  client,
}) => {
  const kept = await project(actors.sender);
  const removed = await project(actors.sender);
  for (const projectEntityId of [kept.entityId, removed.entityId])
    await post(actors.sender, "tasks/mutations", {
      action: "archiveProject",
      organizationId: actors.sender.organizationId,
      projectEntityId,
    });
  const owner = await client(actors.sender);
  const { page } = owner;
  await visit(owner, undefined, "/tasks", { projectId: removed.entityId });
  const archived = page.getByRole("region", { name: "Archived projects", exact: true });
  await archived.getByRole("button", { name: `Restore ${kept.name}`, exact: true }).click();
  await expect(archived.getByRole("link", { name: kept.name, exact: true })).toHaveCount(0);
  await expect(
    page
      .getByRole("complementary", { name: "Projects", exact: true })
      .getByRole("link", { name: kept.name, exact: true }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Delete project", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(page.getByRole("link", { name: removed.name, exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("link", { name: removed.name, exact: true })).toHaveCount(0);
});
