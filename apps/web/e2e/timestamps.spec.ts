import { createCrm } from "../../server/integration/test-support/crm";
import { test } from "./test-support/workspace-fixtures";
import { expect } from "@playwright/test";
import { z } from "zod";

for (const [date, utcHour, tokyoDate] of [
  ["2026-01-15", "21", "Jan 16"],
  ["2026-07-15", "20", "Jul 16"],
] as const) {
  test(`local input survives UTC storage and another viewer's zone on ${date}`, async ({
    account,
    browser,
    baseURL,
  }) => {
    const contact = await createCrm(account, {
      action: "createContact",
      displayName: "Time zone customer",
    });
    const instant = `${date}T${utcHour}:00:00.000Z`;
    const summary = `4 PM Eastern on ${date}`;
    const context = await browser.newContext({
      baseURL,
      storageState: account.state,
      timezoneId: "America/New_York",
    });
    try {
      const page = await context.newPage();
      await page.clock.setFixedTime(new Date(`${date}T23:00:00Z`));
      await page.goto(`/interactions?workspaceId=${account.organizationId}`);
      await page.getByRole("button", { name: "New interaction", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "New interaction", exact: true });
      await dialog.getByRole("combobox", { name: "Contact", exact: true }).click();
      await page.getByRole("option", { name: "Time zone customer", exact: true }).click();
      await dialog.getByLabel("Occurred at", { exact: true }).fill(`${date}T16:00`);
      await dialog.getByLabel("Summary", { exact: true }).fill(summary);
      await dialog.getByRole("button", { name: "Create interaction", exact: true }).click();
      await expect(dialog).toHaveCount(0);

      const stored = await account.request.get("/api/v1/context/interactions", {
        params: { organizationId: account.organizationId, contactEntityId: contact.entityId },
      });
      expect(stored.ok()).toBe(true);
      const result = z
        .object({ data: z.array(z.object({ occurredAt: z.string(), summary: z.string() })) })
        .parse(await stored.json());
      expect(result.data).toEqual([expect.objectContaining({ occurredAt: instant, summary })]);

      const timeline = `/interactions?workspaceId=${account.organizationId}&section=timeline`;
      await page.goto(timeline);
      const row = page.getByRole("listitem").filter({ hasText: summary });
      await expect(row.locator("time")).toHaveText(/4:00 PM$/);
      await expect(row.locator("time")).toHaveAttribute("datetime", instant);

      const tokyo = await browser.newContext({
        baseURL,
        storageState: account.state,
        timezoneId: "Asia/Tokyo",
      });
      try {
        const other = await tokyo.newPage();
        await other.clock.setFixedTime(new Date(`${date}T23:00:00Z`));
        await other.goto(timeline);
        const otherTime = other.getByRole("listitem").filter({ hasText: summary }).locator("time");
        await expect(otherTime).toHaveText(`${tokyoDate}, ${utcHour === "21" ? "6" : "5"}:00 AM`);
        await expect(otherTime).toHaveAttribute("datetime", instant);
      } finally {
        await tokyo.close();
      }
    } finally {
      await context.close();
    }
  });
}
