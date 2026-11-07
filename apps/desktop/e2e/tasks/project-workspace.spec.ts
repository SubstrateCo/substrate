import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { provisionMember } from "../../../web/e2e/test-support/organizations.js";
import { createChannel } from "../messaging/test-support.js";
import { choose } from "../test-support/controls.js";
import { test } from "../test-support/fixture.js";
import { waitForRealtimeIdle } from "../test-support/realtime.js";
import { callTasks } from "../test-support/tasks.js";
import { expect } from "@playwright/test";

test("project actions, task dialogs, inline settings and linked discussions stay connected", async ({
  desktop,
}) => {
  await desktop.provision();
  const page = desktop.page;
  await page.getByRole("button", { name: /^Signed in as / }).click();
  await page.getByRole("switch", { name: "Dark mode", exact: true }).setChecked(true);
  await page.keyboard.press("Escape");
  await desktop.openPath("/tasks");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name", { exact: true }).fill("Portal workspace");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page).toHaveURL(/projectId=/);
  const projectURL = page.url();
  await expect(page.getByRole("tablist")).toHaveAttribute("data-variant", "line");
  const actions = page.getByRole("group", { name: "Project actions", exact: true });
  const copy = actions.getByRole("button", { name: "Copy project link", exact: true });
  const create = actions.getByRole("button", { name: "New task", exact: true });
  await expect(copy).toBeVisible();
  const copyBox = (await copy.boundingBox())!;
  const createBox = (await create.boundingBox())!;
  expect(copyBox.width).toBe(createBox.width);
  expect(copyBox.height).toBe(createBox.height);
  await create.click();
  const dialog = page.getByRole("dialog", { name: "New task", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Task title", { exact: true })).toBeFocused();
  await dialog.getByLabel("Task title", { exact: true }).fill("Discard this task");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(create).toBeFocused();
  await expect(page).toHaveURL(projectURL);
  await create.click();
  await expect(dialog.getByLabel("Task title", { exact: true })).toHaveValue("");
  await dialog.getByLabel("Task title", { exact: true }).fill("Portal milestone");
  await choose(page, "Status", "In Progress");
  await dialog.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: "Portal milestone", exact: true }),
  ).toBeVisible();
  const taskActions = page.getByRole("group", { name: "Task actions", exact: true });
  const taskButtons = taskActions.getByRole("button");
  await expect(taskButtons).toHaveCount(3);
  const boxes = await taskButtons.evaluateAll((buttons) =>
    buttons.map((button) => {
      const { x, y, width, height } = button.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
  for (let index = 1; index < boxes.length; index++) {
    expect(boxes[index]!.y).toBe(boxes[0]!.y);
    expect(boxes[index]!.width).toBe(boxes[0]!.width);
    expect(boxes[index]!.height).toBe(boxes[0]!.height);
    expect(boxes[index]!.x).toBeCloseTo(boxes[index - 1]!.x + boxes[index - 1]!.width, 0);
  }
  await expect(page.getByRole("heading", { name: /^In Progress/ })).toHaveCSS(
    "text-transform",
    "uppercase",
  );
  await page.getByRole("button", { name: "Add In Progress task", exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Status", exact: true })).toContainText(
    "In Progress",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const settings = page.getByRole("tabpanel", { name: "Settings", exact: true });
  const form = settings.getByRole("form", { name: "Project details", exact: true });
  expect((await form.boundingBox())!.width).toBeGreaterThan(
    (await settings.boundingBox())!.width * 0.95,
  );
  await form.getByLabel("Project description", { exact: true }).fill("A clearer project workspace");
  await form.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(form.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await expect(page.getByTitle("A clearer project workspace", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("button", { name: "Messages", exact: true })
    .click();
  await createChannel(page, "portal-discussions");
  const composer = page.getByRole("textbox", { name: "Message #portal-discussions", exact: true });
  await composer.fill("Please review @");
  const references = page.getByRole("region", { name: "Insert workspace reference", exact: true });
  await references
    .getByRole("combobox", { name: "Search references", exact: true })
    .fill("Portal milestone");
  await references.getByRole("option", { name: "Portal milestone", exact: true }).click();
  await composer.press("Enter");
  await expect(page.getByRole("article").filter({ hasText: "Please review" })).toBeVisible();
  await page.goto(projectURL);
  await page.getByRole("tab", { name: "Discussions", exact: true }).click();
  const discussions = page.getByRole("region", { name: "Project discussions", exact: true });
  await expect(discussions).toContainText("Please review");
  const discussion = discussions.locator('[data-slot="item"]').filter({ hasText: "Please review" });
  const discussionBox = (await discussion.boundingBox())!;
  const titleBox = (await discussion.getByRole("link").boundingBox())!;
  const bodyBox = (await discussion
    .getByText("Please review [Reference]", { exact: true })
    .boundingBox())!;
  const metadataBox = (await discussion.locator("time").boundingBox())!;
  expect(titleBox.x - discussionBox.x).toBeGreaterThanOrEqual(16);
  expect(titleBox.y - discussionBox.y).toBeGreaterThanOrEqual(16);
  expect(bodyBox.y - (metadataBox.y + metadataBox.height)).toBeGreaterThanOrEqual(12);
  await discussions
    .getByRole("link", { name: "Related discussion · portal-discussions", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "portal-discussions", exact: true })
      .getByLabel("Linked message", { exact: true }),
  ).toContainText("Please review");
});

test("status groups toggle every task without hiding other groups or changing selection", async ({
  desktop,
}) => {
  await desktop.provision();
  const page = desktop.page;
  const { id: projectEntityId } = await callTasks<{ id: string }>(page, {
    action: "createProject",
    name: "Collapsible tasks",
  });
  let activeTaskId = "";
  for (const [title, status] of [
    ["First queued task", "not_started"],
    ["Second queued task", "not_started"],
    ["Active task", "in_progress"],
  ] as const) {
    const task = await callTasks<{ id: string }>(page, {
      action: "createTask",
      projectEntityId,
      title,
      status,
    });
    if (status === "in_progress") activeTaskId = task.id;
  }
  await desktop.openPath(`/tasks?projectId=${projectEntityId}&taskId=${activeTaskId}`);
  const tasks = page.getByRole("region", { name: "Project tasks", exact: true });
  const queued = tasks.getByRole("button", { name: "Not Started", exact: true });
  const active = tasks.getByRole("button", { name: "In Progress", exact: true });
  await waitForRealtimeIdle(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.getByRole("heading", { name: "Collapsible tasks", exact: true }).hover();
  await expect(queued).toHaveAttribute("aria-expanded", "true");
  await expect(queued).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(active).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await queued.click();
  await expect(queued).toHaveAttribute("aria-expanded", "false");
  for (const title of ["First queued task", "Second queued task"])
    await expect(tasks.getByText(title, { exact: true })).toBeHidden();
  await expect(tasks.getByText("Active task", { exact: true })).toBeVisible();
  const selectedURL = page.url();
  await active.focus();
  await page.keyboard.press("Space");
  await expect(tasks.getByText("Active task", { exact: true })).toBeHidden();
  await expect(page).toHaveURL(selectedURL);
  await expect(
    page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: "Active task", exact: true }),
  ).toBeVisible();
  await queued.focus();
  await page.keyboard.press("Enter");
  for (const title of ["First queued task", "Second queued task"])
    await expect(tasks.getByText(title, { exact: true })).toBeVisible();
  await expect(active).toHaveAttribute("aria-expanded", "false");
});

test("project access reviews grants and removal, keeps reductions neutral, and protects the last owner", async ({
  desktop,
  browser,
}) => {
  await desktop.provision();
  const memberContext = await browser.newContext({ baseURL: desktop.rendererOrigin });
  try {
    const member = await memberContext.newPage();
    await provisionVerifiedAccount(member, desktop.mailpit, desktop.member);
    await provisionMember(desktop.browser, member, desktop.member.email);
    const page = desktop.page;
    await desktop.openPath("/tasks");
    await page.getByRole("button", { name: "New project", exact: true }).click();
    await page.getByLabel("Project name", { exact: true }).fill("Project permissions");
    await page.getByRole("button", { name: "Create project", exact: true }).click();
    await expect(page).toHaveURL(/projectId=/);
    const url = new URL(page.url());
    await waitForRealtimeIdle(page);
    const memberAccess = async () =>
      (
        await member.request.get(
          `/api/v1/tasks/project?organizationId=${url.searchParams.get("workspaceId")}&projectEntityId=${url.searchParams.get("projectId")}`,
        )
      ).json();
    expect((await memberAccess()).success).toBe(false);
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    const sharing = page.getByRole("region", { name: "Project sharing", exact: true });
    await expect(
      sharing.getByRole("combobox", { name: "Desktop Owner permission", exact: true }),
    ).toBeDisabled();
    await expect(sharing.getByText("Last owner", { exact: true })).toBeVisible();
    const add = sharing.getByRole("button", { name: "Add access", exact: true });
    const addDialog = page.getByRole("dialog", { name: "Add project access", exact: true });
    const review = page.getByRole("dialog", { name: "Review access change", exact: true });
    await add.click();
    const actorSearch = addDialog.getByRole("combobox", {
      name: "Search people",
      exact: true,
    });
    await actorSearch.fill("Desktop Member");
    await actorSearch.press("Enter");
    await expect(addDialog.getByText("Selected: Desktop Member", { exact: true })).toBeVisible();
    await actorSearch.press("Enter");
    await expect(addDialog).toBeVisible();
    await expect(review).toHaveCount(0);
    await addDialog.getByRole("button", { name: "Review access", exact: true }).click();
    await expect(review).toContainText("Give Desktop Member edit access");
    await review.getByRole("button", { name: "Cancel access change", exact: true }).click();
    expect((await memberAccess()).success).toBe(false);
    await expect(add).toBeFocused();
    await add.click();
    await addDialog.getByRole("option", { name: "Desktop Member", exact: true }).click();
    await addDialog.getByRole("button", { name: "Review access", exact: true }).click();
    await review.getByRole("button", { name: "Confirm access", exact: true }).click();
    await expect(review).toHaveCount(0);
    expect((await memberAccess()).data.level).toBe("edit");
    const row = sharing.getByRole("listitem").filter({ hasText: "Desktop Member" });
    await row.getByRole("combobox", { name: "Desktop Member permission", exact: true }).click();
    await page.getByRole("option", { name: "View", exact: true }).click();
    await expect(row.getByRole("button", { name: "Apply", exact: true })).toHaveAttribute(
      "data-variant",
      "outline",
    );
    await row.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(row.getByRole("button", { name: "Apply", exact: true })).toHaveCount(0);
    await expect.poll(async () => (await memberAccess()).data.level).toBe("view");
    await row.getByRole("combobox", { name: "Desktop Member permission", exact: true }).click();
    await page.getByRole("option", { name: "No access", exact: true }).click();
    await row.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(review).toContainText("Remove Desktop Member’s direct access");
    await review.getByRole("button", { name: "Remove access", exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect(row).toHaveCount(0);
    expect((await memberAccess()).success).toBe(false);
  } finally {
    await memberContext.close();
  }
});

test("search loads more inside its scroll area, keeps earlier results, and resets on a new query", async ({
  desktop,
}) => {
  await desktop.provision();
  const page = desktop.page;
  const created = await page.evaluate(async () => {
    const session = await (await fetch("/api/v1/session")).json();
    const organizationId = session.data.session.activeOrganizationId;
    const results = [];
    for (let index = 0; index < 31; index++)
      results.push(
        await (
          await fetch("/api/v1/tasks/mutations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "createProject",
              organizationId,
              name: `Search paging ${String(index).padStart(2, "0")}`,
            }),
          })
        ).json(),
      );
    return results.every((result) => result.success);
  });
  expect(created).toBe(true);
  await waitForRealtimeIdle(page);
  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: "Search workspace", exact: true });
  await input.fill("Search paging");
  const search = page.getByRole("region", { name: "Workspace search", exact: true });
  await search.getByRole("button", { name: "Projects", exact: true }).click();
  const results = search.getByRole("listbox", { name: "Search results", exact: true });
  await expect(results.getByRole("link")).toHaveCount(30);
  const more = results.getByRole("button", { name: "Load more results", exact: true });
  await expect(more).not.toBeInViewport();
  await more.scrollIntoViewIfNeeded();
  await expect(more).toBeInViewport({ ratio: 1 });
  await more.click();
  await expect(results.getByRole("link")).toHaveCount(31);
  await expect(more).toHaveCount(0);
  await expect(results.getByText("End of results", { exact: true })).toBeVisible();
  await input.fill("Search paging 30");
  await expect(results.getByRole("link")).toHaveCount(1);
  await expect(results.getByRole("link")).toContainText("Search paging 30");
});
