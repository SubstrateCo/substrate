import { seedCalendar } from "../test-support/calendar";
import { test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect, type Locator } from "@playwright/test";

async function columnEdges(columns: Locator) {
  return columns.locator(":scope > *").evaluateAll((elements) =>
    elements.map((element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right };
    }),
  );
}

test("week columns stay aligned with the headings while scrolling and resizing", async ({
  account,
  client,
}) => {
  const enabled = await account.request.patch("/api/v1/organizations/apps", {
    data: {
      organizationId: account.organizationId,
      enabledApps: ["messages", "agents", "tasks", "crm", "calendar"],
    },
  });
  expect(enabled.ok()).toBe(true);
  await seedCalendar(account);
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/calendar", { date: "2020-01-15", view: "week" });

  // A non-overlay scrollbar makes a missing header gutter observable on every platform.
  await page.addStyleTag({
    content: "::-webkit-scrollbar { width: 16px; height: 16px; }",
  });
  const headings = page.getByTestId("week-day-headings");
  const allDay = page.getByTestId("week-all-day-columns");
  const timed = page.getByTestId("week-time-columns");
  const scroller = page.getByTestId("week-time-scroller");
  await expect(headings.locator(":scope > *")).toHaveCount(7);
  await expect(allDay.getByRole("link", { name: "Planning day", exact: true })).toBeVisible();
  const assertAligned = async () => {
    const expected = await columnEdges(headings);
    for (const band of [allDay, timed]) {
      const actual = await columnEdges(band);
      expect(actual).toHaveLength(7);
      actual.forEach((column, index) => {
        expect(Math.abs(column.left - expected[index]!.left)).toBeLessThan(1);
        expect(Math.abs(column.right - expected[index]!.right)).toBeLessThan(1);
      });
    }
  };

  expect(await scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
    true,
  );
  await assertAligned();
  await captureScreenshot(page, "calendar-week-aligned-columns");
  const initialEdges = await columnEdges(timed);
  const initialScrollTop = await scroller.evaluate((element) => element.scrollTop);
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollTop > 0 ? 0 : element.scrollHeight;
  });
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .not.toBe(initialScrollTop);
  await assertAligned();
  expect(await columnEdges(timed)).toEqual(initialEdges);

  await page.setViewportSize({ width: 1000, height: 700 });
  await assertAligned();
});
