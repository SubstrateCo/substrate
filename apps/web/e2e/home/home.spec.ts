import { provisionWorkspaceSession } from "../../../server/integration/test-support/organizations";
import { post, visit } from "../test-support/fixtures";
import { detail, project } from "../test-support/tasks";
import { test } from "../test-support/workspace-fixtures";
import { expect, type Page } from "@playwright/test";

async function expectBoundedDashboard(page: Page) {
  const dashboard = page.locator("[data-home-dashboard]");
  // Viewport resizing and full-page capture can finish before Chromium updates its scroll area.
  await expect
    .poll(() =>
      dashboard.evaluate((element) => ({
        verticalOverflow: element.scrollHeight - element.clientHeight,
        horizontalOverflow: element.scrollWidth - element.clientWidth,
      })),
    )
    .toEqual({ verticalOverflow: 0, horizontalOverflow: 0 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight))
    .toBeLessThanOrEqual(1);
  await expect
    .poll(() =>
      dashboard.evaluate((element) => element.getBoundingClientRect().bottom - window.innerHeight),
    )
    .toBeLessThanOrEqual(1);
  const bounds = await dashboard.boundingBox();
  expect(bounds).not.toBeNull();
  for (const card of await dashboard.getByRole("region").all()) {
    if (!(await card.isVisible())) continue;
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(bounds!.y);
    expect(box!.y + box!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height);
    expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  }
}

test("Home empty cards stay within the viewport and center content within their bounds", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await visit(user, undefined, "/dashboard");
  await expect(user.page.getByText("No open tasks assigned to you", { exact: true })).toBeVisible();

  for (const height of [900, 650]) {
    await user.page.setViewportSize({ width: 1440, height });
    await expectBoundedDashboard(user.page);
    for (const name of [
      "Needs your attention",
      "My work",
      "Recent updates",
      "My agents",
      "Conversations",
      "CRM follow-ups",
    ]) {
      const items = user.page.getByRole("group", { name: `${name} items`, exact: true });
      const action = items.getByRole("link").first();
      await items.evaluate((element) => {
        element.scrollTop = 0;
      });
      expect(
        await items.evaluate((element) => element.scrollHeight - element.clientHeight),
        `${name} empty content must fit at ${height}px`,
      ).toBeLessThanOrEqual(1);
      await expect(items.getByRole("heading")).toBeInViewport({ ratio: 1 });
      await expect(action).toBeInViewport({ ratio: 1 });
      const alignment = await items.evaluate((element) => {
        const notice = element.querySelector('[role="status"]')!;
        const content = element.firstElementChild!;
        const noticeBounds = notice.getBoundingClientRect();
        const contentBounds = content.getBoundingClientRect();
        return {
          horizontal: Math.abs(
            noticeBounds.x + noticeBounds.width / 2 - (contentBounds.x + contentBounds.width / 2),
          ),
          vertical: Math.abs(
            noticeBounds.y + noticeBounds.height / 2 - (contentBounds.y + contentBounds.height / 2),
          ),
        };
      });
      expect(alignment.horizontal).toBeLessThanOrEqual(1);
      expect(alignment.vertical).toBeLessThanOrEqual(1);
    }
  }
});

test("Home has useful empty states and Messages has its own route", async ({ account, client }) => {
  const user = await client(account);
  await visit(user, undefined, "/dashboard");
  await expect(user.page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(user.page.getByText("You’re caught up", { exact: true })).toBeVisible();
  await expect(user.page.getByText("No open tasks assigned to you", { exact: true })).toBeVisible();
  await expect(user.page.getByRole("link", { name: "Browse tasks", exact: true })).toBeInViewport();
  expect(
    await user.page
      .locator("[data-home-dashboard]")
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
  ).toBe(true);
  await user.page.getByRole("link", { name: "Open messages", exact: true }).click();
  await expect(user.page).toHaveURL(/\/messages/);
  await user.page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(user.page).toHaveURL(/\/dashboard/);
});

test("Home fills the grid when Tasks and CRM are disabled", async ({ account, client }) => {
  const organization = await provisionWorkspaceSession(
    account.request,
    "Home apps workspace",
    `home-apps-${crypto.randomUUID()}`,
    { enableOptionalApps: false },
  );
  account.organizationId = organization.id;
  account.state = await account.request.storageState();
  const user = await client(account);
  const { page } = user;
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/dashboard");
  await expect(page.getByText("You’re caught up", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: /is disabled$/ })).toHaveCount(0);
  const region = (name: string) => page.getByRole("region", { name, exact: true }).boundingBox();
  const attention = await region("Needs your attention");
  const updates = await region("Recent updates");
  const agents = await region("My agents");
  const conversations = await region("Conversations");
  for (const box of [attention, updates, agents, conversations]) expect(box).not.toBeNull();
  const bottom = (box: NonNullable<typeof updates>) => box.y + box.height;
  // Each column runs from the top row to the bottom row with only the grid gap between panels.
  expect(updates!.y - bottom(attention!)).toBeLessThanOrEqual(16);
  expect(conversations!.y - bottom(agents!)).toBeLessThanOrEqual(16);
  expect(Math.abs(bottom(updates!) - bottom(conversations!))).toBeLessThanOrEqual(1);
});

test("Home scrolls assigned work inside its card without scrolling the dashboard", async ({
  account,
  client,
}) => {
  const created = await project(account);
  const data = await detail(account, created.entityId);
  const self = data.actors.find((person) => person.name === account.name);
  expect(self).toBeDefined();
  for (let index = 1; index <= 6; index++) {
    await post(account, "tasks/mutations", {
      action: "createTask",
      organizationId: account.organizationId,
      projectEntityId: created.entityId,
      title: `Dashboard work ${index}`,
      assigneeActorEntityId: self!.entityId,
      dueDate: `2026-01-0${index}`,
    });
  }
  const user = await client(account);
  await visit(user, undefined, "/dashboard");
  const work = user.page.getByRole("group", { name: "My work items", exact: true });
  await expect(work.getByRole("link")).toHaveCount(6);
  for (const height of [900, 650]) {
    await user.page.setViewportSize({ width: 1440, height });
    await expectBoundedDashboard(user.page);
    expect(
      await work.evaluate((element) => element.scrollHeight - element.clientHeight),
    ).toBeGreaterThan(0);
    await work.focus();
    await user.page.keyboard.press("End");
    await expect(work.getByRole("link", { name: /Dashboard work 6/ })).toBeInViewport();
    expect(await work.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expectBoundedDashboard(user.page);
  }
  await user.page.setViewportSize({ width: 390, height: 650 });
  await user.page.getByRole("combobox", { name: "Dashboard section" }).click();
  await user.page.getByRole("option", { name: "My work", exact: true }).click();
  await expect(work).toBeVisible();
  await expect(user.page.getByRole("region", { name: "My agents", exact: true })).toBeHidden();
  await expectBoundedDashboard(user.page);
});

test("Home shows assigned work, opens the exact task, and refreshes after completion", async ({
  account,
  client,
}) => {
  const created = await project(account);
  const data = await detail(account, created.entityId);
  const self = data.actors.find((person) => person.name === account.name);
  expect(self).toBeDefined();
  const task = await post<{ id: string }>(account, "tasks/mutations", {
    action: "createTask",
    organizationId: account.organizationId,
    projectEntityId: created.entityId,
    title: "Review launch plan",
    assigneeActorEntityId: self!.entityId,
    dueDate: "2026-01-01",
  });
  const user = await client(account);
  await visit(user, undefined, "/dashboard");
  const work = user.page.getByRole("region", { name: "My work", exact: true });
  await expect(work.getByText("Review launch plan", { exact: true })).toBeVisible();
  const workBounds = await work.boundingBox();
  const agentBounds = await user.page
    .getByRole("region", { name: "My agents", exact: true })
    .boundingBox();
  expect(workBounds).not.toBeNull();
  expect(agentBounds).not.toBeNull();
  expect(workBounds!.width).toBeGreaterThan(agentBounds!.width);
  expect(workBounds!.height).toBeGreaterThan(agentBounds!.height);
  expect(
    await user.page
      .locator("[data-home-dashboard]")
      .evaluate((element) => element.scrollHeight <= element.clientHeight),
  ).toBe(true);
  await work.getByRole("link", { name: /Review launch plan/ }).click();
  await expect(user.page).toHaveURL(new RegExp(`taskId=${task.id}`));
  await expect(
    user.page.getByRole("heading", { name: "Review launch plan", exact: true }),
  ).toBeVisible();
  await user.page.getByRole("link", { name: "Home", exact: true }).click();
  await post(account, "tasks/mutations", {
    action: "updateTask",
    organizationId: account.organizationId,
    projectEntityId: created.entityId,
    taskEntityId: task.id,
    status: "completed",
  });
  await expect(work.getByText("Review launch plan", { exact: true })).toHaveCount(0);
});
