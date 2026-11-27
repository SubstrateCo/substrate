import { project } from "../test-support/tasks";
import { test } from "../test-support/workspace-fixtures";
import { expect, type Locator } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function expectCentered(notice: Locator, region: Locator) {
  await expect(notice).toBeVisible();
  await expect(async () => {
    const bounds = await region.boundingBox();
    const content = await notice.evaluate((element) => {
      const children = [...element.children].map((child) => child.getBoundingClientRect());
      return {
        left: Math.min(...children.map((child) => child.left)),
        right: Math.max(...children.map((child) => child.right)),
        top: Math.min(...children.map((child) => child.top)),
        bottom: Math.max(...children.map((child) => child.bottom)),
      };
    });
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThan(200);
    expect(
      Math.abs((content.left + content.right) / 2 - (bounds!.x + bounds!.width / 2)),
    ).toBeLessThan(2);
    expect(
      Math.abs((content.top + content.bottom) / 2 - (bounds!.y + bounds!.height / 2)),
    ).toBeLessThan(2);
  }).toPass();
}

test("empty pages and collection results use the available page height", async ({
  account,
  client,
}) => {
  const user = await client(account);
  await user.page.goto(`/tasks?workspaceId=${account.organizationId}`);
  const projects = user.page.locator('[data-slot="empty"]').filter({
    has: user.page.getByRole("heading", { name: "No projects yet", exact: true }),
  });
  await expectCentered(projects, user.page.locator('[data-slot="page-content"]'));

  await user.page.goto(`/contacts?workspaceId=${account.organizationId}`);
  const contacts = user.page.locator('[data-slot="empty"]').filter({
    has: user.page.getByRole("heading", { name: "No contacts yet", exact: true }),
  });
  const results = user.page.locator('[data-slot="table-results"]');
  await expectCentered(contacts, results);
  const pageBounds = await user.page.locator('[data-slot="page-content"]').boundingBox();
  const resultsBounds = await results.boundingBox();
  expect(pageBounds).not.toBeNull();
  expect(resultsBounds).not.toBeNull();
  expect(
    Math.abs(pageBounds!.y + pageBounds!.height - resultsBounds!.y - resultsBounds!.height - 24),
  ).toBeLessThan(2);
});

test("empty task lists and unavailable record panels center their notices", async ({
  account,
  client,
}) => {
  const created = await project(account);
  const user = await client(account);
  const url = `/tasks?workspaceId=${account.organizationId}&projectId=${created.entityId}`;
  await user.page.goto(url);
  const tasks = user.page.getByRole("region", { name: "Project tasks", exact: true });
  const taskNotice = tasks.locator('[data-slot="empty"]');
  await expectCentered(taskNotice, taskNotice.locator(".."));

  await user.page.goto(`${url}&taskId=${randomUUID()}`);
  const panel = user.page.getByRole("dialog", { name: "Task", exact: true });
  const unavailable = panel.locator('[data-slot="empty"]');
  await expectCentered(unavailable, unavailable.locator(".."));
});
