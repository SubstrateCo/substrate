import { post, test, visit } from "./test-support/fixtures";
import { detail, project, select, share } from "./test-support/tasks";
import { expect } from "@playwright/test";

test("move a task with its subtasks, follow its old link, change parent, and delete it", async ({
  actors,
  client,
}) => {
  const source = await project(actors.sender);
  const destination = await project(actors.sender);
  const create = (projectEntityId: string, title: string, parentTaskEntityId?: string) =>
    post<{ id: string }>(actors.sender, "tasks/mutations", {
      action: "createTask",
      organizationId: actors.sender.organizationId,
      projectEntityId,
      title,
      parentTaskEntityId,
    });
  const parent = await create(source.entityId, "Move parent");
  const child = await create(source.entityId, "Move child", parent.id);
  await create(destination.entityId, "Destination parent");
  const user = await client(actors.sender);
  await visit(user, undefined, "/tasks", { projectId: source.entityId, taskId: parent.id });
  const oldLink = user.page.url();
  const inspector = user.page.getByRole("region", { name: "Task details", exact: true });
  await inspector.getByRole("button", { name: "Task actions", exact: true }).click();
  await user.page.getByRole("menuitem", { name: "Move task", exact: true }).click();
  const dialog = user.page.getByRole("dialog", { name: "Move task", exact: true });
  await select(user.page, "Destination project", destination.name);
  await select(user.page, "Parent task", "Destination parent");
  await dialog.getByRole("button", { name: "Move task", exact: true }).click();
  await expect
    .poll(() => new URL(user.page.url()).searchParams.get("projectId"))
    .toBe(destination.entityId);
  await expect(inspector.getByRole("heading", { name: "Move parent", exact: true })).toBeVisible();
  expect(
    (await detail(actors.sender, destination.entityId)).tasks.find(
      (task) => task.entityId === child.id,
    )?.parentTaskEntityId,
  ).toBe(parent.id);
  await user.page.goto(oldLink);
  await expect
    .poll(() => new URL(user.page.url()).searchParams.get("projectId"))
    .toBe(destination.entityId);
  await inspector.getByRole("button", { name: "Task actions", exact: true }).click();
  await user.page.getByRole("menuitem", { name: "Move task", exact: true }).click();
  await select(user.page, "Parent task", "No parent task");
  await dialog.getByRole("button", { name: "Move task", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    (await detail(actors.sender, destination.entityId)).tasks.find(
      (task) => task.entityId === parent.id,
    )?.parentTaskEntityId,
  ).toBeNull();
  await inspector.getByRole("button", { name: "Task actions", exact: true }).click();
  await user.page.getByRole("menuitem", { name: "Delete task", exact: true }).click();
  const deleted = user.page.waitForResponse(
    (response) =>
      response.url().endsWith("/tasks/mutations") &&
      response.request().postDataJSON()?.action === "deleteTask",
  );
  await user.page.getByRole("button", { name: "Delete task", exact: true }).click();
  expect((await deleted).ok()).toBe(true);
  await expect(inspector).toHaveCount(0);
  expect(
    (await detail(actors.sender, destination.entityId)).tasks.map((task) => task.entityId),
  ).not.toContain(child.id);
  await user.page.getByRole("tab", { name: "Settings", exact: true }).click();
  await user.page.getByRole("button", { name: "Delete project", exact: true }).click();
  await user.page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete project", exact: true })
    .click();
  await expect(user.page.getByRole("button", { name: destination.name, exact: true })).toHaveCount(
    0,
  );
  await user.page.reload();
  await expect(user.page.getByRole("button", { name: destination.name, exact: true })).toHaveCount(
    0,
  );
});

test("moving work to a private project removes it from another viewer’s open inspector", async ({
  actors,
  client,
}) => {
  const source = await project(actors.sender);
  const destination = await project(actors.sender);
  await share(actors.sender, source.entityId, actors.member.name, "view");
  const task = await post<{ id: string }>(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: source.entityId,
    title: "Moved private work",
  });
  const viewer = await client(actors.member);
  await visit(viewer, undefined, "/tasks", { projectId: source.entityId, taskId: task.id });
  await expect(
    viewer.page.getByRole("heading", { name: "Moved private work", exact: true }),
  ).toBeVisible();
  await post(actors.sender, "tasks/mutations", {
    action: "moveTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: source.entityId,
    taskEntityId: task.id,
    destinationProjectEntityId: destination.entityId,
    parentTaskEntityId: null,
  });
  await expect(
    viewer.page.getByRole("heading", { name: "Task unavailable", exact: true }),
  ).toBeVisible();
  await expect(viewer.page.getByText("Moved private work", { exact: true })).toHaveCount(0);
  await expect(viewer.page.getByText(destination.name, { exact: true })).toHaveCount(0);
});

test("removing project access explains that assigned tasks must be reassigned first", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  await share(actors.sender, created.entityId, actors.member.name, "edit");
  const data = await detail(actors.sender, created.entityId);
  const assignee = data.actors.find((actor) => actor.name === actors.member.name)!;
  await post(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Assigned work",
    assigneeActorEntityId: assignee.entityId,
  });
  const user = await client(actors.sender);
  await visit(user, undefined, "/tasks", { projectId: created.entityId });
  await user.page.getByRole("tab", { name: "Settings", exact: true }).click();
  await user.page
    .getByRole("button", { name: `Remove ${actors.member.name}’s access`, exact: true })
    .click();
  await user.page.getByRole("button", { name: "Remove access", exact: true }).click();
  await expect(user.page.getByRole("alert")).toContainText("Reassign or unassign");
  expect(
    (await detail(actors.sender, created.entityId)).members.some(
      (member) => member.actorEntityId === assignee.entityId,
    ),
  ).toBe(true);
});

test("saving a description does not overwrite a title changed by another client", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  const task = await post<{ id: string }>(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Original title",
  });
  const user = await client(actors.sender);
  await visit(user, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  await user.page.getByRole("button", { name: "Edit task", exact: true }).click();
  await user.page.getByLabel("Task description", { exact: true }).fill("My description edit");
  await post(actors.sender, "tasks/mutations", {
    action: "updateTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    taskEntityId: task.id,
    title: "Another client’s title",
  });
  await expect(
    user.page.getByRole("button", { name: /^Not started: Another client’s title/ }),
  ).toBeVisible();
  const saved = user.page.waitForRequest(
    (request) =>
      request.url().endsWith("/tasks/mutations") && request.postDataJSON()?.action === "updateTask",
  );
  await user.page.getByRole("button", { name: "Save task", exact: true }).click();
  expect((await saved).postDataJSON()).toEqual({
    action: "updateTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    taskEntityId: task.id,
    description: "My description edit",
  });
  await expect(
    user.page.getByRole("heading", { name: "Another client’s title", exact: true }),
  ).toBeVisible();
  expect(
    (await detail(actors.sender, created.entityId)).tasks.find((item) => item.entityId === task.id),
  ).toMatchObject({
    title: "Another client’s title",
    description: "My description edit",
  });
});
