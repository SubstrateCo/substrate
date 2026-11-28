import { post, test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { detail, project, share } from "../test-support/tasks";
import { expect } from "@playwright/test";

test("task details assign to me in one click and preserve the assignment on reload", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  await post(actors.sender, "tasks/mutations", {
    action: "updateProject",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    name: "Product launch",
    description: "",
  });
  await share(actors.sender, created.entityId, actors.member.name, "edit");
  const data = await detail(actors.sender, created.entityId);
  const owner = data.actors.find((actor) => actor.name === actors.sender.name)!;
  const member = data.actors.find((actor) => actor.name === actors.member.name)!;
  const task = await post<{ id: string }>(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Review the release checklist",
    description: "Check the final release notes and confirm that the rollout is ready.",
  });
  const user = await client(actors.sender);
  const { page } = user;
  await visit(user, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  const panel = page.getByRole("region", { name: "Task details", exact: true });
  const assign = panel.getByRole("button", { name: "Assign to me", exact: true });
  await expect(assign).toBeVisible();
  await captureScreenshot(page, "task-assign-to-me");
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(assign).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureScreenshot(page, "task-assign-to-me-narrow");
  await page.setViewportSize({ width: 1440, height: 900 });
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/tasks/mutations") &&
      response.request().postDataJSON()?.action === "updateTask",
  );
  await assign.click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toMatchObject({
    assigneeActorEntityId: owner.entityId,
  });
  await expect(
    panel.getByRole("combobox", { name: `Assignee: ${actors.sender.name}`, exact: true }),
  ).toBeVisible();
  await expect(assign).toHaveCount(0);
  await page.reload();
  await expect(
    panel.getByRole("combobox", { name: `Assignee: ${actors.sender.name}`, exact: true }),
  ).toBeVisible();
  await expect(assign).toHaveCount(0);
  expect(
    (await detail(actors.sender, created.entityId)).tasks.find((row) => row.entityId === task.id)
      ?.assigneeActorEntityId,
  ).toBe(owner.entityId);
  await captureScreenshot(page, "task-assigned-to-me");

  await post(actors.sender, "tasks/mutations", {
    action: "updateTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    taskEntityId: task.id,
    assigneeActorEntityId: member.entityId,
  });
  await expect(assign).toBeVisible();
  await assign.click();
  await expect(
    panel.getByRole("combobox", { name: `Assignee: ${actors.sender.name}`, exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await detail(actors.sender, created.entityId)).tasks.find(
          (row) => row.entityId === task.id,
        )?.assigneeActorEntityId,
    )
    .toBe(owner.entityId);

  const editor = await client(actors.member);
  await visit(editor, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  const editorPanel = editor.page.getByRole("region", { name: "Task details", exact: true });
  await editorPanel.getByRole("button", { name: "Assign to me", exact: true }).click();
  await expect(
    editorPanel.getByRole("combobox", { name: `Assignee: ${actors.member.name}`, exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await detail(actors.member, created.entityId)).tasks.find(
          (row) => row.entityId === task.id,
        )?.assigneeActorEntityId,
    )
    .toBe(member.entityId);
});

test("task details do not offer self-assignment to a read-only viewer or in an archived project", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  await share(actors.sender, created.entityId, actors.member.name, "view");
  const task = await post<{ id: string }>(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Read-only task",
  });
  const viewer = await client(actors.member);
  await visit(viewer, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  const panel = viewer.page.getByRole("region", { name: "Task details", exact: true });
  await expect(panel.getByRole("heading", { name: "Read-only task", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Assign to me", exact: true })).toHaveCount(0);
  await post(actors.sender, "tasks/mutations", {
    action: "archiveProject",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
  });
  const owner = await client(actors.sender);
  await visit(owner, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  const archived = owner.page.getByRole("region", { name: "Task details", exact: true });
  await expect(
    archived.getByRole("heading", { name: "Read-only task", exact: true }),
  ).toBeVisible();
  await expect(archived.getByRole("button", { name: "Assign to me", exact: true })).toHaveCount(0);
});
