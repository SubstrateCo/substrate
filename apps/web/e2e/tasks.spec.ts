import { expectChange, post, test, visit } from "./test-support/fixtures";
import { detail, project, select, share } from "./test-support/tasks";
import { expect } from "@playwright/test";

test("task drafts ask before navigation and project drafts stay with their project", async ({
  actors,
  client,
}) => {
  const first = await project(actors.sender);
  const second = await project(actors.sender);
  const task = await post<{ id: string }>(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: first.entityId,
    title: "Draft target",
  });
  await post(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: first.entityId,
    title: "Other task",
  });
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/tasks", { projectId: first.entityId, taskId: task.id });
  await sender.page.getByRole("button", { name: "Edit task" }).click();
  await sender.page.getByLabel("Task title").fill("Unsaved task title");
  await sender.page.getByRole("button", { name: /^Not started: Other task/ }).click();
  await sender.page.getByRole("button", { name: "Keep editing" }).click();
  await expect(sender.page.getByLabel("Task title")).toHaveValue("Unsaved task title");
  await sender.page.getByLabel("Add a comment").fill("A comment draft");
  await sender.page.getByRole("button", { name: "Close task" }).click();
  await expect(sender.page.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeVisible();
  await sender.page.getByRole("button", { name: "Keep editing" }).click();
  await expect(sender.page.getByLabel("Add a comment")).toHaveText("A comment draft");
  await sender.page.getByRole("tab", { name: "Settings" }).click();
  await sender.page.getByRole("button", { name: "Discard changes" }).click();
  // The task inspector keeps its draft guard until its exit animation ends.
  await expect(sender.page.getByRole("complementary", { name: "Task", exact: true })).toHaveCount(
    0,
  );
  await sender.page.getByLabel("Project name", { exact: true }).fill("Unsaved project name");
  await sender.page.getByRole("button", { name: second.name, exact: true }).click();
  await sender.page.getByRole("button", { name: "Discard changes" }).click();
  await sender.page.getByRole("tab", { name: "Settings" }).click();
  await expect(sender.page.getByLabel("Project name", { exact: true })).toHaveValue(second.name);
});

test("a click outside the task inspector closes it, but controls, drafts and background task changes keep it", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  const [first] = await Promise.all(
    ["Open task", "Other task"].map((title) =>
      post<{ id: string }>(actors.sender, "tasks/mutations", {
        action: "createTask",
        organizationId: actors.sender.organizationId,
        projectEntityId: created.entityId,
        title,
      }),
    ),
  );
  const user = await client(actors.sender);
  await visit(user, undefined, "/tasks", { projectId: created.entityId, taskId: first.id });
  const inspector = user.page.getByRole("complementary", { name: "Task", exact: true });
  const outside = user.page.getByRole("heading", { name: created.name, exact: true });
  await expect(inspector.getByRole("heading", { name: "Open task", exact: true })).toBeVisible();
  // Another task's row switches the inspector instead of closing it.
  await user.page.getByRole("button", { name: /^Not started: Other task/ }).click();
  await expect(inspector.getByRole("heading", { name: "Other task", exact: true })).toBeVisible();
  // A click inside the inspector keeps it open.
  await inspector.getByRole("heading", { name: "Other task", exact: true }).click();
  await expect(inspector).toBeVisible();
  // A draft asks before the click outside closes the inspector.
  await inspector.getByLabel("Add a comment").fill("A comment draft");
  await outside.click();
  await user.page.getByRole("button", { name: "Keep editing" }).click();
  await expect(inspector.getByLabel("Add a comment")).toHaveText("A comment draft");
  await inspector.getByLabel("Add a comment").fill("");
  await outside.click();
  await expect(inspector).toHaveCount(0);
  expect(new URL(user.page.url()).searchParams.has("taskId")).toBe(false);

  // A task created elsewhere refreshes the project without discarding an open edit draft.
  await user.page.getByRole("button", { name: /^Not started: Open task/ }).click();
  await inspector.getByRole("button", { name: "Edit task", exact: true }).click();
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
  await expect(
    user.page.getByRole("button", { name: /^Not started: Background task/ }),
  ).toBeVisible();
  await expect(editor).toHaveValue(draft);
});

test("create a project, task and subtask, then edit and reload the task", async ({
  actors,
  client,
}) => {
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/tasks");
  const name = `Project ${crypto.randomUUID()}`;
  await sender.page
    .getByRole("complementary", { name: "Projects", exact: true })
    .getByRole("button", { name: "New project", exact: true })
    .click();
  const newProject = sender.page.getByRole("dialog", { name: "New project" });
  await newProject.getByLabel("Project name", { exact: true }).fill(name);
  await newProject
    .getByLabel("Project description", { exact: true })
    .fill("Release regression coverage");
  await sender.page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(sender.page.getByRole("heading", { name, exact: true })).toBeVisible();
  await sender.page
    .getByRole("group", { name: "Project actions", exact: true })
    .getByRole("button", { name: "New task", exact: true })
    .click();
  await sender.page.getByLabel("Task title", { exact: true }).fill("Ship release");
  await sender.page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(sender.page.getByRole("dialog")).toHaveCount(0);
  const task = sender.page.getByRole("region", { name: "Task details", exact: true });
  await expect(task.getByRole("heading", { name: "Ship release", exact: true })).toBeVisible();
  // The final load of this URL proves the task, its edits and its subtask persisted.
  const taskURL = sender.page.url();
  await task.getByRole("button", { name: "Edit task", exact: true }).click();
  await sender.page.getByLabel("Task title", { exact: true }).fill("Ship reviewed release");
  await select(sender.page, "Status", "In progress");
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
  await expect(task.getByText("In progress", { exact: true })).toBeVisible();
  await expect(task.getByText("High", { exact: true })).toBeVisible();
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
  await sender.page
    .getByRole("group", { name: "Project actions", exact: true })
    .getByRole("button", { name: "New task", exact: true })
    .click();
  const title = `Assigned ${created.entityId}`;
  await sender.page.getByLabel("Task title", { exact: true }).fill(title);
  await select(sender.page, "Assignee", actors.member.name);
  await sender.page.getByRole("button", { name: "Create task", exact: true }).click();
  const notice = member.page.getByRole("listitem").filter({ hasText: title });
  await expect(notice.getByRole("link")).toHaveAccessibleName(
    `${actors.sender.name} assigned you ${title}, unread`,
  );
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
  // The owner's separate window reads the comment back from the server, so it persisted.
  await expect(sender.page.getByText(comment, { exact: true })).toBeVisible();
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
  await sender.page.getByRole("button", { name: "Add people", exact: true }).click();
  await expect(
    sender.page.getByRole("dialog", { name: `Share ${created.name}`, exact: true }),
  ).toBeVisible();
  await sender.page.getByRole("option", { name: new RegExp(actors.member.name) }).click();
  await select(sender.page, "Permission", "Can view");
  expect(
    (await detail(actors.sender, created.entityId)).members.map((item) => item.name),
  ).not.toContain(actors.member.name);
  await sender.page.getByRole("button", { name: "Share project", exact: true }).click();
  await member.page.getByRole("button", { name: created.name, exact: true }).click();
  await member.page.getByRole("button", { name: new RegExp(`^Not started: ${title}`) }).click();
  await expect.poll(() => new URL(member.page.url()).searchParams.get("taskId")).toBe(task.id);
  await expect(
    member.page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(member.page.getByRole("button", { name: "Edit task", exact: true })).toHaveCount(0);
  await expect(member.page.getByLabel("Add a comment", { exact: true })).toHaveCount(0);
  const since = member.events.length;
  await sender.page
    .getByRole("button", { name: `Remove ${actors.member.name}’s access`, exact: true })
    .click();
  await sender.page.getByRole("button", { name: "Remove access", exact: true }).click();
  await expectChange(member, since, "access");
  await expect(
    member.page.getByRole("heading", { name: "Project unavailable", exact: true }),
  ).toBeVisible();
  await expect(member.page.getByText(title, { exact: true })).toHaveCount(0);
  await expect(member.page.getByRole("button", { name: created.name, exact: true })).toHaveCount(0);
  await member.page.getByRole("combobox", { name: "Search workspace", exact: true }).fill(title);
  await expect(member.page.getByText(`No results for “${title}”`, { exact: true })).toBeVisible();
  await expect(member.page.getByRole("link", { name: `Task: ${title}`, exact: true })).toHaveCount(
    0,
  );
});

test("a blocking link marks a task blocked, and a comment mention alerts the person and backlinks the task", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  await share(actors.sender, created.entityId, actors.member.name, "edit");
  const task = (title: string) =>
    post<{ id: string }>(actors.sender, "tasks/mutations", {
      action: "createTask",
      organizationId: actors.sender.organizationId,
      projectEntityId: created.entityId,
      title,
    });
  const waiting = `Waiting ${created.entityId}`;
  const blocker = `Blocker ${created.entityId}`;
  const [first, second] = await Promise.all([task(waiting), task(blocker)]);
  await post(actors.sender, "tasks/mutations", {
    action: "comment",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    taskEntityId: second.id,
    body: `Do this before @[task:${first.id}]`,
  });
  const [sender, member] = await Promise.all([client(actors.sender), client(actors.member)]);
  await Promise.all([
    visit(sender, undefined, "/tasks", { projectId: created.entityId, taskId: first.id }),
    visit(member, undefined, "/notifications"),
  ]);
  const links = sender.page.getByRole("region", { name: "Linked tasks", exact: true });
  await links.getByRole("button", { name: "Link a task", exact: true }).click();
  await sender.page.getByLabel("Search tasks to link", { exact: true }).fill(blocker);
  await sender.page.getByRole("option", { name: new RegExp(blocker) }).click();
  await expect(
    links
      .getByRole("group", { name: "Is blocked by", exact: true })
      .getByRole("button", { name: `Not started: ${blocker}`, exact: true }),
  ).toBeVisible();
  // The filter keeps only the open task that waits on an open task.
  await sender.page.getByRole("radio", { name: "Blocked", exact: true }).click();
  await expect(
    sender.page.getByRole("button", { name: new RegExp(`^Not started: ${waiting}.*Blocked`) }),
  ).toBeVisible();
  await expect(
    sender.page.getByRole("button", { name: new RegExp(`^Not started: ${blocker}`) }),
  ).toHaveCount(1);
  // The other task's comment references this task, so this task lists it.
  await expect(
    sender.page
      .getByRole("region", { name: "Mentioned in comments", exact: true })
      .getByRole("link", { name: new RegExp(blocker) }),
  ).toBeVisible();

  await sender.page.getByLabel("Add a comment", { exact: true }).click();
  await sender.page.keyboard.type(`Please check @${actors.member.name.split(" ")[0]}`);
  await sender.page.getByRole("option", { name: new RegExp(actors.member.name) }).click();
  await sender.page.getByRole("button", { name: "Post comment", exact: true }).click();
  const comments = sender.page.getByRole("region", { name: "Task comments", exact: true });
  await expect(comments.getByRole("listitem").getByText(actors.member.name)).toBeVisible();
  await expect(
    member.page.getByRole("listitem").filter({ hasText: waiting }).getByRole("link"),
  ).toHaveAccessibleName(`${actors.sender.name} mentioned you in a comment on ${waiting}, unread`);
});
