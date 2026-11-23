import { test, visit, type Actor } from "./test-support/fixtures";
import { expect } from "@playwright/test";

// These workflows need the server's /api/v1/calendar routes. They do not need Google: an account
// with no linked provider shows the empty states. Workflows with events need seeded calendar data
// (a linked Google credential, a calendar, and synced events); they are marked `fixme` below until
// the server offers a fixture that seeds them without calling Google.

async function setApps(actor: Actor, calendar: boolean) {
  const response = await actor.request.patch("/api/v1/organizations/apps", {
    data: {
      organizationId: actor.organizationId,
      enabledApps: ["messages", "agents", "tasks", "crm", ...(calendar ? ["calendar"] : [])],
    },
  });
  expect(response.ok(), "The fixture sets the organization's apps").toBe(true);
}

test("a new user sees how to connect a calendar in settings and in the Calendar app", async ({
  account,
  client,
}) => {
  await setApps(account, true);
  const user = await client(account);
  const { page } = user;

  await visit(user, undefined, "/settings/user/calendars");
  const sections = page.getByRole("navigation", { name: "Settings sections", exact: true });
  await expect(sections.getByRole("link", { name: "Calendars", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Calendars", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No calendars connected", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect Google account", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Outlook|Microsoft/ })).toHaveCount(0);

  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await apps.getByRole("link", { name: /^Calendar/ }).click();
  await expect(page).toHaveURL(/\/calendar/);
  const notice = page.getByRole("status").filter({ hasText: "No calendars connected" });
  await expect(notice).toBeVisible();
  await notice.getByRole("link", { name: "Connect a calendar", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/user\/calendars/);
});

test("Calendar is hidden and explained while the app is disabled", async ({ account, client }) => {
  await setApps(account, false);
  const user = await client(account);
  const { page } = user;

  await visit(user, undefined, "/calendar");
  await expect(
    page.getByRole("heading", { name: "Calendar is disabled", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("link", { name: /^Calendar/ }),
  ).toHaveCount(0);

  await visit(user, undefined, "/settings/user/calendars");
  await expect(
    page.getByRole("heading", { name: "Calendar is disabled", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "View apps", exact: true })).toBeVisible();
});

test("an owner enables Calendar in organization apps", async ({ account, client }) => {
  await setApps(account, false);
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/settings/organization/apps");
  const calendar = page
    .getByRole("region", { name: "Workspace apps", exact: true })
    .getByRole("switch", { name: "Calendar", exact: true });
  await expect(calendar).not.toBeChecked();
  await calendar.click();
  await expect(calendar).toBeChecked();
  await expect(
    page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("link", { name: /^Calendar/ }),
  ).toBeVisible();
});

test("the week view and agenda share the period controls", async ({ account, client }) => {
  await setApps(account, true);
  const user = await client(account);
  const { page } = user;
  // A past week, so "Today" is always available.
  await visit(user, undefined, "/calendar", { date: "2020-01-15" });
  const view = page.getByRole("group", { name: "Calendar view", exact: true });
  await view.getByRole("radio", { name: "Week", exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByRole("heading", { name: "January 2020", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(page).toHaveURL(/date=2020-01-22/);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).not.toHaveURL(/date=/);
});

// Needs seeded data: a linked Google account with one calendar, a past meeting with an outside
// attendee that recorded an interaction, and a private event that was skipped.
test.fixme("an event opens beside the calendar from its link and shows what it recorded", async ({
  account,
  client,
}) => {
  await setApps(account, true);
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/calendar");
  await page.getByRole("link", { name: /Pricing review/ }).click();
  await expect(page).toHaveURL(/eventId=/);
  const panel = page.getByRole("complementary", { name: "Event details", exact: true });
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
  await expect(panel.getByText("Will be added as contact")).toHaveCount(0);
  await expect(panel.getByText("Recorded", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Close event", exact: true }).click();
  await expect(page).not.toHaveURL(/eventId=/);
});

// Needs seeded data: a recorded calendar interaction on a contact.
test.fixme("a calendar interaction links back to its meeting from the contact", async ({
  account,
  client,
}) => {
  const user = await client(account);
  const { page } = user;
  await expect(page.getByText("From meeting:")).toBeVisible();
  await expect(page.getByRole("region", { name: "Meetings", exact: true })).toBeVisible();
});
