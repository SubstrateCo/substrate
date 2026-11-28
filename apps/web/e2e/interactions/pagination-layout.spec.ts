import { createCrm } from "../../../server/integration/test-support/crm";
import { visit } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect } from "@playwright/test";

test("pages fit the screen; page turns and loading keep the table frame and pager in place; empty results hide the pager", async ({
  account,
  client,
}) => {
  test.setTimeout(60_000);
  for (let start = 0; start < 26; start += 4) {
    await Promise.all(
      Array.from({ length: Math.min(4, 26 - start) }, async (_, index) => {
        const contact = await createCrm(account, {
          action: "createContact",
          displayName: `Person ${String(start + index).padStart(2, "0")}`,
        });
        await createCrm(account, {
          action: "createInteraction",
          contactEntityId: contact.entityId,
          kind: "note",
          occurredAt: new Date().toISOString(),
          summary: "Discussed the next steps.",
        });
      }),
    );
  }
  const user = await client(account);
  const { page } = user;
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 720 });
    await visit(user, undefined, "/interactions", { section: "people", days: "all" });
    const table = page.getByRole("table", { name: "People directory", exact: true });
    const pager = page.getByRole("navigation", { name: "People directory pagination" });
    const next = pager.getByRole("button", { name: "Next page", exact: true });
    const results = page.getByRole("region", { name: "People directory results", exact: true });
    const fits = () => results.evaluate((element) => element.scrollHeight <= element.clientHeight);
    await expect(next).toBeEnabled();
    const rows = await table.getByRole("row").count();
    expect(rows).toBeGreaterThan(2);
    expect(await fits()).toBe(true);
    await expect(pager).toBeInViewport();
    const position = await pager.boundingBox();
    await next.click();
    await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
    await expect(async () => {
      expect((await pager.boundingBox())!.y).toBeCloseTo(position!.y, 0);
    }).toPass({ timeout: 2_000 });
    expect(await fits()).toBe(true);
    await pager.getByRole("button", { name: "Previous page", exact: true }).click();
    await expect(table.getByRole("row")).toHaveCount(rows);

    // A taller window fits more rows on a page.
    await page.setViewportSize({ width, height: 900 });
    await expect(async () => {
      expect(await table.getByRole("row").count()).toBeGreaterThan(rows);
    }).toPass({ timeout: 5_000 });
    expect(await fits()).toBe(true);
    await page.setViewportSize({ width, height: 720 });
    await expect(table.getByRole("row")).toHaveCount(rows);

    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const path = "**/api/v1/context/interactions/directory?*";
    await page.route(path, async (route) => {
      if (new URL(route.request().url()).searchParams.get("search") === "No matching person")
        await held;
      await route.continue();
    });
    try {
      const search = page.getByRole("searchbox", { name: "Search people", exact: true });
      await search.scrollIntoViewIfNeeded();
      const before = await pager.boundingBox();
      await search.fill("No matching person");
      await expect(table).toHaveAttribute("aria-busy", "true");
      await expect(pager).toBeVisible();
      expect((await pager.boundingBox())!.y).toBeCloseTo(before!.y, 0);
      await expect(next).toBeDisabled();
      release();
      await expect(page.getByText("No matching people", { exact: true })).toBeVisible();
      await expect(pager).toHaveCount(0);
    } finally {
      release();
      await page.unroute(path);
    }
  }
});
