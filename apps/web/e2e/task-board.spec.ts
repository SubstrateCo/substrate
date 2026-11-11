import { post, test, visit } from "./test-support/fixtures";
import { detail, project, share } from "./test-support/tasks";
import { expect, type Page } from "@playwright/test";

async function dragCard(page: Page, title: string, status: string, cancel = false) {
  const board = page.getByRole("region", { name: "Task board", exact: true });
  const handle = board.getByRole("button", { name: `Drag ${title}`, exact: true });
  const source = await handle.boundingBox();
  const target = await board.getByRole("region", { name: status, exact: true }).boundingBox();
  if (!source || !target) throw new Error("Drag targets are not visible.");
  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(source.x + source.width / 2 + 10, source.y + source.height / 2);
  await page.mouse.move(target.x + target.width / 2, target.y + 100, { steps: 20 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
}

test("board moves persist, filters survive view switches, and cards open the task inspector", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const created = await project(actors.sender);
  await post(actors.sender, "tasks/mutations", {
    action: "updateProject",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    name: "Product launch",
    description: "One backlog, two ways to plan the work.",
  });
  await Promise.all(
    (
      [
        ["Design the onboarding flow", "not_started", "high"],
        ["Connect workspace data", "in_progress", "medium"],
        ["Review launch checklist", "in_review", "urgent"],
        ["Set up the project", "completed", "low"],
      ] as const
    ).map(([title, status, priority]) =>
      post(actors.sender, "tasks/mutations", {
        action: "createTask",
        organizationId: actors.sender.organizationId,
        projectEntityId: created.entityId,
        title,
        status,
        priority,
      }),
    ),
  );
  const user = await client(actors.sender);
  const { page } = user;
  await page.setViewportSize({ width: 1600, height: 1000 });
  await visit(user, undefined, "/tasks", { projectId: created.entityId });
  const tasksTab = await page.getByRole("tab", { name: "Tasks", exact: true }).boundingBox();
  const boardSwitch = await page.getByRole("radio", { name: "Board", exact: true }).boundingBox();
  if (!tasksTab || !boardSwitch) throw new Error("Project controls are not visible.");
  expect(boardSwitch.y).toBeLessThan(tasksTab.y + tasksTab.height);
  expect(boardSwitch.y + boardSwitch.height).toBeGreaterThan(tasksTab.y);
  expect(boardSwitch.x).toBeGreaterThan(tasksTab.x + tasksTab.width);
  await page.getByRole("radio", { name: "Board", exact: true }).click();
  const board = page.getByRole("region", { name: "Task board", exact: true });
  const progress = board.getByRole("region", { name: "In progress", exact: true });
  await expect(board.getByRole("region")).toHaveCount(5);
  await dragCard(page, "Design the onboarding flow", "In progress");
  await expect(
    progress.getByRole("button", { name: "Open Design the onboarding flow", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await detail(actors.sender, created.entityId)).tasks.find(
          (task) => task.title === "Design the onboarding flow",
        )?.status,
    )
    .toBe("in_progress");
  await page.getByRole("searchbox", { name: "Filter tasks" }).fill("onboarding");
  await page.getByRole("radio", { name: "List", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^In progress: Design the onboarding flow/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /In progress: Connect workspace data/ }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: "Board", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Filter tasks" })).toHaveValue("onboarding");
  await page.getByRole("searchbox", { name: "Filter tasks" }).fill("");
  await board.getByRole("button", { name: "Open Design the onboarding flow", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: "Design the onboarding flow", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close task", exact: true }).click();
  const statusMenu = board.getByRole("button", {
    name: "Change status of Design the onboarding flow: In progress",
    exact: true,
  });
  await statusMenu.focus();
  await statusMenu.press("Enter");
  await page.getByRole("menuitemradio", { name: "In review", exact: true }).press("Enter");
  await expect(
    board
      .getByRole("region", { name: "In review", exact: true })
      .getByRole("button", { name: "Open Design the onboarding flow", exact: true }),
  ).toBeVisible();
  await expect
    .poll(
      async () =>
        (await detail(actors.sender, created.entityId)).tasks.find(
          (task) => task.title === "Design the onboarding flow",
        )?.status,
    )
    .toBe("in_review");
  await page.reload();
  await page.getByRole("radio", { name: "Board", exact: true }).click();
  await expect(
    board
      .getByRole("region", { name: "In review", exact: true })
      .getByRole("button", { name: "Open Design the onboarding flow", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Discussions", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Board", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Board", exact: true })).toBeChecked();
});

test("failed and canceled drags keep the saved status, and pending moves cannot overlap", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  await post(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Move safely",
  });
  const user = await client(actors.sender);
  await visit(user, undefined, "/tasks", { projectId: created.entityId });
  await user.page.getByRole("radio", { name: "Board", exact: true }).click();
  const board = user.page.getByRole("region", { name: "Task board", exact: true });
  const original = board.getByRole("region", { name: "Not started", exact: true });
  await dragCard(user.page, "Move safely", "In progress", true);
  await expect(
    original.getByRole("button", { name: "Open Move safely", exact: true }),
  ).toBeVisible();
  expect((await detail(actors.sender, created.entityId)).tasks[0]?.status).toBe("not_started");
  const release = Promise.withResolvers<void>();
  await user.page.route("**/api/v1/tasks/mutations", async (route) => {
    await release.promise;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "INTERNAL_ERROR", message: "Unavailable" },
      }),
    });
  });
  try {
    await dragCard(user.page, "Move safely", "In progress");
    await expect(
      board
        .getByRole("region", { name: "In progress", exact: true })
        .getByRole("button", { name: "Open Move safely", exact: true }),
    ).toBeVisible();
    await expect(
      board.getByRole("button", { name: "Drag Move safely", exact: true }),
    ).toBeDisabled();
    release.resolve();
    await expect(
      original.getByRole("button", { name: "Open Move safely", exact: true }),
    ).toBeVisible();
    await expect(
      user.page.getByText("Couldn't change the status. It was set back.", { exact: true }),
    ).toBeVisible();
    expect((await detail(actors.sender, created.entityId)).tasks[0]?.status).toBe("not_started");
  } finally {
    release.resolve();
    await user.page.unroute("**/api/v1/tasks/mutations");
  }
});

test("empty columns create tasks in their status, retain subtask context, and scroll within a narrow window", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  const user = await client(actors.sender);
  await visit(user, undefined, "/tasks", { projectId: created.entityId });
  await user.page.getByRole("radio", { name: "Board", exact: true }).click();
  const board = user.page.getByRole("region", { name: "Task board", exact: true });
  await board.getByRole("button", { name: "Add task to In review", exact: true }).click();
  await user.page.getByLabel("Task title", { exact: true }).fill("Review the release");
  await user.page.getByRole("button", { name: "Create task", exact: true }).click();
  const inspector = user.page.getByRole("region", { name: "Task details", exact: true });
  await expect(
    inspector.getByRole("heading", { name: "Review the release", exact: true }),
  ).toBeVisible();
  expect((await detail(actors.sender, created.entityId)).tasks[0]?.status).toBe("in_review");
  await inspector.getByRole("button", { name: "Add subtask", exact: true }).click();
  await user.page.getByLabel("Task title", { exact: true }).fill("Check the links");
  await user.page.getByRole("button", { name: "Create subtask", exact: true }).click();
  await expect(
    inspector.getByRole("heading", { name: "Check the links", exact: true }),
  ).toBeVisible();
  await user.page.getByRole("button", { name: "Close task", exact: true }).click();
  await expect(board.getByText("Review the release", { exact: true })).toHaveCount(2);
  await user.page.getByRole("searchbox", { name: "Filter tasks" }).fill("no matching title");
  await expect(
    user.page.getByRole("heading", { name: "No matching tasks", exact: true }),
  ).toBeVisible();
  await user.page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(
    board.getByRole("button", { name: "Open Check the links", exact: true }),
  ).toBeVisible();
  await user.page.setViewportSize({ width: 1000, height: 800 });
  expect(await board.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect(
    await user.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await board
    .getByRole("button", { name: "Add task to Canceled", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    board.getByRole("button", { name: "Add task to Canceled", exact: true }),
  ).toBeInViewport();
});

test("viewers can browse the board but cannot move or create tasks", async ({ actors, client }) => {
  const created = await project(actors.sender);
  await post(actors.sender, "tasks/mutations", {
    action: "createTask",
    organizationId: actors.sender.organizationId,
    projectEntityId: created.entityId,
    title: "Read-only card",
  });
  await share(actors.sender, created.entityId, actors.member.name, "view");
  const viewer = await client(actors.member);
  await visit(viewer, undefined, "/tasks", { projectId: created.entityId });
  await viewer.page.getByRole("radio", { name: "Board", exact: true }).click();
  const board = viewer.page.getByRole("region", { name: "Task board", exact: true });
  await expect(board.getByRole("button", { name: /^Drag / })).toHaveCount(0);
  await expect(board.getByRole("button", { name: /^Change status/ })).toHaveCount(0);
  await expect(board.getByRole("button", { name: /^Add task/ })).toHaveCount(0);
  await board.getByRole("button", { name: "Open Read-only card", exact: true }).click();
  await expect(
    viewer.page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: "Read-only card", exact: true }),
  ).toBeVisible();
});
