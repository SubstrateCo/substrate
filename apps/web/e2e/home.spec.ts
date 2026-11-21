import { post, test, visit } from "./test-support/fixtures";
import { detail, project } from "./test-support/tasks";
import { expect } from "@playwright/test";

test("Home has useful empty states and Messages has its own route", async ({ account, client }) => {
  const user = await client(account);
  await visit(user, undefined, "/dashboard");
  await expect(user.page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(user.page.getByText("You’re caught up", { exact: true })).toBeVisible();
  await expect(user.page.getByText("No open tasks assigned to you", { exact: true })).toBeVisible();
  await expect(user.page.getByRole("link", { name: "Browse tasks", exact: true })).toBeInViewport();
  await expect(user.page.getByRole("link", { name: /Start with a conversation/ })).toBeInViewport();
  await expect(user.page.getByRole("link", { name: /Delegate to an agent/ })).toBeInViewport();
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
