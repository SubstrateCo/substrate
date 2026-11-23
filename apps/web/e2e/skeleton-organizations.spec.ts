import { test } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("member rows stay inert while the organization loads and become real rows", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  await user.page.route("**/api/auth/organization/get-full-organization?**", async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    held.resolve();
    await release.promise;
    await route.fulfill({ response });
  });

  try {
    const since = user.events.length;
    await user.page.goto(`/settings/organization/members?workspaceId=${account.organizationId}`);
    await user.waitForEvent(
      since,
      (event) => event.type === "ready",
      "The authenticated WebSocket completes its ready handshake",
    );
    await held.promise;
    const table = user.page.getByRole("table", { name: "Members", exact: true });
    await expect(table).toBeVisible();
    const placeholders = table.locator('tbody tr[aria-hidden="true"]');
    await expect(placeholders).toHaveCount(3);
    await expect(placeholders.locator("button, a, input, select, [tabindex]")).toHaveCount(0);
    const placeholder = await placeholders.first().boundingBox();
    release.resolve();
    await expect(placeholders).toHaveCount(0);
    const row = table.getByRole("row").filter({ hasText: account.email });
    await expect(row.getByText(account.email, { exact: true })).toBeVisible();
    const loaded = await row.boundingBox();
    expect(placeholder).not.toBeNull();
    expect(loaded).not.toBeNull();
    expect(Math.abs(placeholder!.height - loaded!.height)).toBeLessThan(2);
    await expect(
      user.page.getByText(
        /Reconnecting to live updates|Live updates disconnected|some data failed to refresh/,
      ),
    ).toHaveCount(0);
  } finally {
    release.resolve();
  }
});
