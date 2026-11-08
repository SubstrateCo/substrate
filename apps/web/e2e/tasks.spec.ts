import { expectChange, post, test, visit } from "./test-support/fixtures";
import { detail, project, select, share } from "./test-support/tasks";
import { expect } from "@playwright/test";

test("create a project, task and subtask, then edit and reload the task", async ({
  actors,
  client,
}) => {
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/tasks");
  const name = `Project ${crypto.randomUUID()}`;
  await sender.page.getByRole("button", { name: "New project", exact: true }).click();
  await sender.page.getByLabel("Project name", { exact: true }).fill(name);
  await sender.page
    .getByLabel("Project description", { exact: true })
    .fill("Release regression coverage");
  await sender.page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(sender.page.getByRole("heading", { name, exact: true })).toBeVisible();
  await sender.page.getByRole("button", { name: "New task", exact: true }).click();
  await sender.page.getByLabel("Task title", { exact: true }).fill("Ship release");
  await sender.page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(sender.page.getByRole("dialog")).toHaveCount(0);
  const task = sender.page.getByRole("region", { name: "Task details", exact: true });
  await expect(task.getByRole("heading", { name: "Ship release", exact: true })).toBeVisible();
  const taskURL = sender.page.url();
  await sender.page.reload();
  await expect(task.getByRole("heading", { name: "Ship release", exact: true })).toBeVisible();
  await task.getByRole("button", { name: "Edit task", exact: true }).click();
  await sender.page.getByLabel("Task title", { exact: true }).fill("Ship reviewed release");
  await select(sender.page, "Status", "In Progress");
  await select(sender.page, "Priority", "High");
  await sender.page.getByRole("button", { name: "Save task", exact: true }).click();
  await expect(
    task.getByRole("heading", { name: "Ship reviewed release", exact: true }),
  ).toBeVisible();
  await task.getByRole("button", { name: "Add subtask", exact: true }).click();
  await sender.page.getByLabel("Task title", { exact: true }).fill("Verify release");
  await sender.page.getByRole("button", { name: "Create subtask", exact: true }).click();
  await expect(task.getByRole("heading", { name: "Verify release", exact: true })).toBeVisible();
  await sender.page.goto(taskURL);
  await expect(
    task.getByRole("heading", { name: "Ship reviewed release", exact: true }),
  ).toBeVisible();
  await expect(task.getByText("In Progress", { exact: true })).toBeVisible();
  await expect(task.getByText("high", { exact: true })).toBeVisible();
  const projectId = new URL(taskURL).searchParams.get("projectId")!;
  const persisted = await detail(actors.sender, projectId);
  expect(persisted.tasks.find((item) => item.title === "Verify release")?.parentTaskEntityId).toBe(
    new URL(taskURL).searchParams.get("taskId"),
  );
});

test("assignment notifies a project member, whose comment reaches the owner live", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  await share(actors.sender, created.entityId, actors.member.name, "edit");
  const [sender, member] = await Promise.all([client(actors.sender), client(actors.member)]);
  await Promise.all([
    visit(sender, undefined, "/tasks", { projectId: created.entityId }),
    visit(member, undefined, "/notifications"),
  ]);
  const since = member.events.length;
  await sender.page.getByRole("button", { name: "New task", exact: true }).click();
  const title = `Assigned ${created.entityId}`;
  await sender.page.getByLabel("Task title", { exact: true }).fill(title);
  await select(sender.page, "Assignee", actors.member.name);
  await sender.page.getByRole("button", { name: "Create task", exact: true }).click();
  const notice = member.page.getByRole("listitem").filter({ hasText: title });
  await expect(notice.getByText("Assigned to you", { exact: true })).toBeVisible();
  await expectChange(member, since, "notifications");
  await notice.getByRole("link").click();
  await expect(
    member.page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const comment = `Ready for review ${created.entityId}`;
  await member.page.getByLabel("Add a comment", { exact: true }).fill(comment);
  await member.page.getByRole("button", { name: "Post comment", exact: true }).click();
  await expect(sender.page.getByText(comment, { exact: true })).toBeVisible();
  await member.page.reload();
  await expect(member.page.getByText(comment, { exact: true })).toBeVisible();
});

test("project sharing needs confirmation and revocation removes cached private content live", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  const title = `Private task ${created.entityId}`;
  const task = await post<{ id: string }>(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title,
  });
  const [sender, member] = await Promise.all([client(actors.sender), client(actors.member)]);
  await Promise.all([
    visit(sender, undefined, "/tasks", { projectId: created.entityId }),
    visit(member, undefined, "/tasks"),
  ]);
  await expect(member.page.getByRole("button", { name: created.name, exact: true })).toHaveCount(0);
  await sender.page.getByRole("tab", { name: "Settings", exact: true }).click();
  await sender.page.getByRole("button", { name: "Add access", exact: true }).click();
  await sender.page.getByRole("option", { name: new RegExp(actors.member.name) }).click();
  await select(sender.page, "Permission", "View");
  await sender.page.getByRole("button", { name: "Review access", exact: true }).click();
  await expect(
    sender.page.getByRole("dialog", { name: "Review access change", exact: true }),
  ).toBeVisible();
  expect(
    (await detail(actors.sender, created.entityId)).members.map((item) => item.name),
  ).not.toContain(actors.member.name);
  await sender.page.getByRole("button", { name: "Confirm access", exact: true }).click();
  await member.page.getByRole("button", { name: created.name, exact: true }).click();
  await visit(member, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  await expect(
    member.page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(member.page.getByRole("button", { name: "Edit task", exact: true })).toHaveCount(0);
  await expect(member.page.getByLabel("Add a comment", { exact: true })).toHaveCount(0);
  const since = member.events.length;
  await select(sender.page, `${actors.member.name} permission`, "No access");
  await sender.page
    .getByRole("listitem")
    .filter({ hasText: actors.member.name })
    .getByRole("button", { name: "Apply", exact: true })
    .click();
  await sender.page.getByRole("button", { name: "Remove access", exact: true }).click();
  await expectChange(member, since, "access");
  await expect(
    member.page.getByRole("heading", { name: "Project unavailable", exact: true }),
  ).toBeVisible();
  await expect(member.page.getByText(title, { exact: true })).toHaveCount(0);
  await expect(member.page.getByRole("button", { name: created.name, exact: true })).toHaveCount(0);
  await member.page.getByRole("combobox", { name: "Search workspace", exact: true }).fill(title);
  await expect(
    member.page.getByText("No accessible results found. Try another search.", { exact: true }),
  ).toBeVisible();
  await expect(member.page.getByRole("link", { name: `task · ${title}`, exact: true })).toHaveCount(
    0,
  );
});

test("a background task creation does not discard an open task draft", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  const task = await post<{ id: string }>(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Existing task",
  });
  const user = await client(actors.sender);
  await visit(user, undefined, "/tasks", { projectId: created.entityId, taskId: task.id });
  await expect.poll(() => user.events.some((event) => event.type === "ready")).toBe(true);
  await user.page.getByRole("button", { name: "Edit task", exact: true }).click();
  const editor = user.page.getByRole("textbox", { name: "Task title", exact: true });
  const draft = "Unsaved task draft";
  await editor.fill(draft);
  const since = user.events.length;
  await post(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Background task",
  });
  await expectChange(user, since, "tasks");
  await expect(editor).toHaveValue(draft);
});
