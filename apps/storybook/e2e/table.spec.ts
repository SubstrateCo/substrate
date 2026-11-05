import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/iframe.html?id=components-table--invitations&viewMode=story");
});

test("shared table pages, sorts dates chronologically, and keeps missing dates last", async ({
  page,
}) => {
  const table = page.getByRole("table", { name: "Invitations" });
  const rows = table.getByRole("row");
  const pagination = page.getByRole("navigation", { name: "Invitations pagination" });
  await expect(rows).toHaveCount(11);
  await expect(rows.nth(1).getByRole("cell").nth(1)).toHaveText("Nov 23, 2026, 10:30 AM UTC");
  await expect(pagination.getByRole("link", { name: "Go to previous page" })).toBeDisabled();
  await pagination.getByRole("link", { name: "Go to page 3", exact: true }).click();
  await expect(rows).toHaveCount(4);
  await expect(pagination.getByRole("link", { name: "Go to next page" })).toBeDisabled();
  await table.getByRole("button", { name: "Expires" }).click();
  await expect(table.getByRole("columnheader", { name: "Expires" })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(rows.nth(1)).toContainText("person-22@example.com");
  await expect(pagination.getByRole("link", { name: "Go to page 1", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await pagination.getByRole("link", { name: "Go to page 3", exact: true }).click();
  await expect(rows.last()).toContainText("person-23@example.com");
  await table.getByRole("button", { name: "Expires" }).click();
  await expect(rows.nth(1)).toContainText("person-01@example.com");
  await pagination.getByRole("link", { name: "Go to page 3", exact: true }).click();
  await expect(rows.last()).toContainText("person-23@example.com");
  await expect(rows.last().getByRole("cell").nth(1)).toHaveText("—");
});

test("data removal on the last page recovers to a populated page", async ({ page }) => {
  await page.getByRole("link", { name: "Go to page 3", exact: true }).click();
  await page.getByRole("button", { name: "Keep first invitation" }).click();
  const table = page.getByRole("table", { name: "Invitations" });
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("person-01@example.com");
});

for (const [story, message] of [
  ["empty", "No invitations yet."],
  ["loading", "Loading invitations…"],
  ["load-error", "Could not load invitations."],
]) {
  test(`${story} state does not expose stale rows or pagination`, async ({ page }) => {
    await page.goto(`/iframe.html?id=components-table--${story}&viewMode=story`);
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.getByRole("table")).not.toContainText("person-01@example.com");
    await expect(page.getByRole("navigation", { name: "Invitations pagination" })).toHaveCount(0);
    if (story === "load-error") {
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(page.getByRole("table")).toContainText("person-01@example.com");
    }
  });
}

test("table scroll stays inside its container on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await expect(page.getByRole("table", { name: "Invitations" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Go to next page" }).click();
  await expect(page.getByRole("table")).toContainText("person-11@example.com");
});

for (const theme of ["light", "dark"]) {
  test(`table controls support keyboard access in the ${theme} theme`, async ({ page }) => {
    await page.goto(
      `/iframe.html?id=components-table--invitations&viewMode=story&globals=theme:${theme}`,
    );
    const table = page.getByRole("table", { name: "Invitations" });
    await table.getByRole("button", { name: "Email", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(table.getByRole("columnheader", { name: "Email" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    await page.getByRole("link", { name: "Go to next page" }).focus();
    await page.keyboard.press("Enter");
    await expect(table.getByRole("row").nth(1)).toContainText("person-11@example.com");
    await expect(page.getByRole("link", { name: "Go to page 2", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
}
