import { createCrm } from "../../../server/integration/test-support/crm";
import { inviteMember, visit } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect, type Locator, type Page, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function holdResponse(page: Page, pattern: string) {
  const ready = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const handler = async (route: Route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    ready.resolve();
    await release.promise;
    await route.fulfill({ response });
  };
  await page.route(pattern, handler);
  return {
    ready: ready.promise,
    async close() {
      release.resolve();
      await page.unrouteAll({ behavior: "wait" });
    },
  };
}

async function expectSkeletonCells(table: Locator) {
  const headers = table.locator("thead th");
  const rows = table.locator('tbody tr[aria-hidden="true"]');
  await expect(rows).toHaveCount(3);
  const headerCount = await headers.count();
  expect(headerCount).toBeGreaterThan(0);
  for (const row of await rows.all()) {
    const cells = row.locator("td");
    await expect(cells).toHaveCount(headerCount);
    for (let index = 0; index < headerCount; index++) {
      const header = await headers.nth(index).boundingBox();
      const cell = await cells.nth(index).boundingBox();
      expect(header).not.toBeNull();
      expect(cell).not.toBeNull();
      expect(Math.abs(header!.x - cell!.x)).toBeLessThan(1);
      expect(Math.abs(header!.width - cell!.width)).toBeLessThan(1);
    }
  }
}

test("accounts keep their table layout while the initial list loads", async ({
  account,
  client,
}) => {
  await createCrm(account, { action: "createAccount", name: "Skeleton customer" });
  const user = await client(account);
  const held = await holdResponse(user.page, "**/api/v1/crm/accounts?**");
  try {
    await visit(user, undefined, "/crm", { section: "accounts" });
    await held.ready;
    const table = user.page.getByRole("table", { name: "accounts" });
    await expect(table).toBeVisible();
    await expectSkeletonCells(table);
    await expect(table.getByRole("columnheader").getByRole("button")).toHaveCount(0);
  } finally {
    await held.close();
  }
  await expect(
    user.page.getByRole("link", { name: "Skeleton customer", exact: true }),
  ).toBeVisible();
});

test("invitation table restores sorting after initial loading", async ({ account, client }) => {
  const email = `skeleton-${randomUUID()}@example.test`;
  await inviteMember(account, email);
  const user = await client(account);
  const held = await holdResponse(user.page, "**/api/auth/organization/list-invitations?**");
  try {
    const since = user.events.length;
    await user.page.goto(
      `/settings/organization/invitations?workspaceId=${account.organizationId}`,
    );
    await user.waitForEvent(
      since,
      (event) => event.type === "ready",
      "The real authenticated WebSocket completes its ready handshake",
    );
    await held.ready;
    const table = user.page.getByRole("table", { name: "Invitations" });
    await expect(table).toBeVisible();
    await expectSkeletonCells(table);
    await expect(table.getByRole("columnheader").getByRole("button")).toHaveCount(0);
  } finally {
    await held.close();
  }
  const table = user.page.getByRole("table", { name: "Invitations" });
  await expect(table.getByText(email, { exact: true })).toBeVisible();
  await expect(
    user.page.getByText(
      /Reconnecting to live updates|Live updates disconnected|some data failed to refresh/,
    ),
  ).toHaveCount(0);
  await expect(
    table.getByRole("columnheader").getByRole("button", { name: "Email" }),
  ).toBeEnabled();
});
