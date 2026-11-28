import { expectChange, post, send, test, visit } from "../test-support/fixtures";
import { detail, project, select, share } from "../test-support/tasks";
import { expect, type Locator } from "@playwright/test";

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
  await sender.page
    .getByRole("button", { name: /^Not started: Other task/ })
    .getByText("Other task", { exact: true })
    .click();
  await sender.page.getByRole("button", { name: "Keep editing" }).click();
  await expect(sender.page.getByLabel("Task title")).toHaveValue("Unsaved task title");
  await sender.page.getByRole("button", { name: "Close task" }).click();
  await expect(sender.page.getByRole("dialog", { name: "Discard unsaved changes?" })).toBeVisible();
  await sender.page.getByRole("button", { name: "Keep editing" }).click();
  await expect(sender.page.getByLabel("Task title")).toHaveValue("Unsaved task title");
  await sender.page.getByRole("tab", { name: "Settings" }).click();
  await sender.page.getByRole("button", { name: "Discard changes" }).click();
  await expect(sender.page.getByRole("dialog", { name: "Task", exact: true })).toHaveCount(0);
  await sender.page.getByLabel("Project name", { exact: true }).fill("Unsaved project name");
  await sender.page.getByRole("link", { name: second.name, exact: true }).click();
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
  const inspector = user.page.getByRole("dialog", { name: "Task", exact: true });
  const outside = user.page.getByRole("heading", { name: created.name, exact: true });
  await expect(inspector.getByRole("heading", { name: "Open task", exact: true })).toBeVisible();
  await user.page
    .getByRole("button", { name: /^Not started: Other task/ })
    .getByText("Other task", { exact: true })
    .click();
  await expect(inspector.getByRole("heading", { name: "Other task", exact: true })).toBeVisible();
  await inspector.getByRole("heading", { name: "Other task", exact: true }).click();
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "Edit task", exact: true }).click();
  const title = inspector.getByLabel("Task title", { exact: true });
  await title.fill("Unsaved other task");
  await outside.click();
  await user.page.getByRole("button", { name: "Keep editing" }).click();
  await expect(
    user.page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true }),
  ).toHaveCount(0);
  await expect(title).toHaveValue("Unsaved other task");
  await expect(title).toBeFocused();
  await title.fill("Other task");
  await outside.click();
  await expect(inspector).toHaveCount(0);
  await expect.poll(() => new URL(user.page.url()).searchParams.has("taskId")).toBe(false);

  await user.page
    .getByRole("button", { name: /^Not started: Open task/ })
    .getByText("Open task", { exact: true })
    .click();
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
  await expect(sender.page.getByRole("dialog", { name: "New task", exact: true })).toHaveCount(0);
  const task = sender.page.getByRole("region", { name: "Task details", exact: true });
  await expect(task.getByRole("heading", { name: "Ship release", exact: true })).toBeVisible();
  const taskURL = sender.page.url();
  await task.getByRole("button", { name: "Edit task", exact: true }).click();
  await sender.page.getByLabel("Task title", { exact: true }).fill("Ship reviewed release");
  await select(sender.page, "Status", "In progress");
  await select(sender.page, "Priority", "High");
  await sender.page.getByRole("button", { name: "Save", exact: true }).click();
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
  await expect(task.getByRole("button", { name: /Verify release/ })).toBeVisible();
});

test("assignment notifies a project member, whose discussion message reaches the owner live", async ({
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
  await member.page.getByRole("link", { name: "View full conversation", exact: true }).click();
  await sender.page.getByRole("link", { name: "View full conversation", exact: true }).click();
  await expect(member.page.getByRole("textbox", { name: /^Message / })).toBeVisible();
  await expect(sender.page.getByRole("textbox", { name: /^Message / })).toBeVisible();
  const conversationId = new URL(member.page.url()).searchParams.get("conversationId")!;
  const ownerSince = sender.events.length;
  const message = `Ready for review ${created.entityId}`;
  await send(member.page, message);
  await expect(sender.page.getByText(message, { exact: true })).toBeVisible();
  await expectChange(sender, ownerSince, "messaging", conversationId);
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
  await expect(member.page.getByRole("link", { name: created.name, exact: true })).toHaveCount(0);
  await sender.page.getByRole("tab", { name: "Settings", exact: true }).click();
  await sender.page.getByRole("button", { name: "Add people", exact: true }).click();
  await expect(
    sender.page.getByRole("dialog", { name: `Share ${created.name}`, exact: true }),
  ).toBeVisible();
  await select(sender.page, "Person", actors.member.name);
  await select(sender.page, "Access", "Can view");
  expect(
    (await detail(actors.sender, created.entityId)).members.map((item) => item.name),
  ).not.toContain(actors.member.name);
  await sender.page.getByRole("button", { name: "Share project", exact: true }).click();
  await member.page.getByRole("link", { name: created.name, exact: true }).click();
  await member.page.getByRole("button", { name: new RegExp(`^Not started: ${title}`) }).click();
  await expect.poll(() => new URL(member.page.url()).searchParams.get("taskId")).toBe(task.id);
  await expect(
    member.page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(member.page.getByRole("button", { name: "Edit task", exact: true })).toHaveCount(0);
  await member.page.getByRole("button", { name: "Close task", exact: true }).click();
  await member.page.getByRole("radio", { name: "Board", exact: true }).click();
  const board = member.page.getByRole("region", { name: "Task board", exact: true });
  await expect(board.getByRole("button", { name: /^Drag / })).toHaveCount(0);
  await expect(board.getByRole("button", { name: /^Change status/ })).toHaveCount(0);
  await expect(board.getByRole("button", { name: /^Add task/ })).toHaveCount(0);
  await board.getByRole("button", { name: `Open ${title}`, exact: true }).click();
  await expect(member.page.getByRole("heading", { name: title, exact: true })).toBeVisible();
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
  await expect(member.page.getByRole("link", { name: created.name, exact: true })).toHaveCount(0);
  await member.page.getByRole("combobox", { name: "Search workspace", exact: true }).fill(title);
  await expect(member.page.getByText(`No results for “${title}”`, { exact: true })).toBeVisible();
  await expect(member.page.getByRole("link", { name: `Task: ${title}`, exact: true })).toHaveCount(
    0,
  );
});

test("at 1440px, two filter pills, Clear filters, the search and sort share one toolbar row", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  const self = (await detail(actors.sender, created.entityId)).actors.find(
    (actor) => actor.name === actors.sender.name,
  );
  expect(self).toBeDefined();
  await post(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Assigned task",
    assigneeActorEntityId: self!.entityId,
  });
  const sender = await client(actors.sender);
  await sender.page.setViewportSize({ width: 1440, height: 900 });
  await visit(sender, undefined, "/tasks", { projectId: created.entityId });
  const toolbar = sender.page.getByRole("toolbar", { name: "Task filters", exact: true });
  const choose = async (field: string, option: string) => {
    await toolbar.getByRole("button", { name: "Filter", exact: true }).click();
    await sender.page.getByRole("option", { name: field, exact: true }).click();
    await sender.page.getByRole("option", { name: option, exact: true }).click();
    await sender.page.keyboard.press("Escape");
  };
  await choose("Scope", "Active");
  await choose("Assignee", actors.sender.name);
  const scope = toolbar.getByRole("group", { name: "Scope is Active", exact: true });
  await expect(
    toolbar.getByRole("group", { name: `Assignee is ${actors.sender.name}`, exact: true }),
  ).toBeVisible();
  const middle = async (control: Locator) => {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    return box!.y + box!.height / 2;
  };
  const row = await middle(scope);
  for (const control of [
    toolbar.getByRole("button", { name: "Clear filters", exact: true }),
    toolbar.getByRole("searchbox", { name: "Search tasks", exact: true }),
    toolbar.getByRole("radio", { name: "Board", exact: true }),
  ]) {
    expect(Math.abs((await middle(control)) - row)).toBeLessThanOrEqual(2);
  }
});

test("a blocking link marks a task blocked", async ({ actors, client }) => {
  const created = await project(actors.sender);
  const task = (title: string) =>
    post<{ id: string }>(actors.sender, "tasks/mutations", {
      action: "createTask",
      organizationId: actors.sender.organizationId,
      projectEntityId: created.entityId,
      title,
    });
  const waiting = `Waiting ${created.entityId}`;
  const blocker = `Blocker ${created.entityId}`;
  const [first] = await Promise.all([task(waiting), task(blocker)]);
  const sender = await client(actors.sender);
  await visit(sender, undefined, "/tasks", { projectId: created.entityId, taskId: first.id });
  const links = sender.page.getByRole("region", { name: "Linked tasks", exact: true });
  await links.getByRole("button", { name: "Link a task", exact: true }).click();
  await sender.page.getByLabel("Search tasks to link", { exact: true }).fill(blocker);
  await sender.page.getByRole("option", { name: new RegExp(blocker) }).click();
  await expect(
    links
      .getByRole("group", { name: "Is blocked by", exact: true })
      .getByRole("button", { name: `Not started: ${blocker}`, exact: true }),
  ).toBeVisible();
  await sender.page.getByRole("button", { name: "Filter", exact: true }).click();
  await sender.page.getByRole("option", { name: "Scope", exact: true }).click();
  await sender.page.getByRole("option", { name: "Blocked", exact: true }).click();
  await expect(
    sender.page.getByRole("group", { name: "Scope is Blocked", exact: true }),
  ).toBeVisible();
  await expect(
    sender.page.getByRole("button", { name: new RegExp(`^Not started: ${waiting}.*Blocked`) }),
  ).toBeVisible();
  await expect(
    sender.page.getByRole("button", { name: new RegExp(`^Not started: ${blocker}`) }),
  ).toHaveCount(1);
});
