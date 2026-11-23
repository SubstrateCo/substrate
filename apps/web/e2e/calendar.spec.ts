import { seedCalendar } from "./test-support/calendar";
import { test, visit, type Actor } from "./test-support/fixtures";
import { expect } from "@playwright/test";

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
  await page.getByRole("radio", { name: "Week", exact: true }).click();
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByRole("heading", { name: "January 2020", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(page).toHaveURL(/date=2020-01-22/);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).not.toHaveURL(/date=/);
});

test("an event opens beside the calendar from its link and shows what it recorded", async ({
  account,
  client,
}) => {
  await setApps(account, true);
  const saved = await seedCalendar(account);
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/calendar", { date: "2020-01-15" });
  await page.getByRole("link", { name: /Pricing review/ }).click();
  await expect(page).toHaveURL(new RegExp(`eventId=${saved.eventId}`));
  const panel = page.getByRole("complementary", { name: "Event details", exact: true });
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
  await expect(panel.getByText("Will be added as contact")).toHaveCount(0);
  await expect(panel.getByText("Recorded", { exact: true })).toBeVisible();
  const recorded = panel.getByRole("list", { name: "Recorded interactions", exact: true });
  await expect(recorded.getByRole("link", { name: "Jordan Lee", exact: true })).toHaveAttribute(
    "href",
    new RegExp(`recordId=${saved.contactEntityId}`),
  );
  await page.reload();
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
  await expect(panel.getByText("Recorded", { exact: true })).toBeVisible();
  // A recorded interaction opens over the calendar and closes back to the event.
  await recorded.getByRole("link", { name: "Open interaction", exact: true }).click();
  const interaction = page.getByRole("dialog", { name: "Interaction", exact: true });
  await expect(interaction.getByRole("heading", { name: /with Jordan Lee$/ })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/calendar");
  expect(new URL(page.url()).searchParams.get("eventId")).toBe(saved.eventId);
  expect(new URL(page.url()).searchParams.get("interactionId")).toBeTruthy();
  await interaction.getByRole("button", { name: "Close interaction", exact: true }).click();
  await expect(interaction).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("interactionId")).toBe(false);
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Close event", exact: true }).click();
  await expect(page).not.toHaveURL(/eventId=/);
  await expect(panel).toHaveCount(0);
  await page.getByRole("link", { name: /Private review/ }).click();
  await expect(page).toHaveURL(new RegExp(`eventId=${saved.privateEventId}`));
  await expect(panel.getByText("Skipped", { exact: true })).toBeVisible();
  await expect(panel.getByText("Private event", { exact: true })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Recorded interactions", exact: true })).toHaveCount(
    0,
  );
  await expect(panel.getByText("Will be added as contact")).toHaveCount(0);
});

test("a calendar interaction links back to its meeting from the contact", async ({
  account,
  client,
}) => {
  await setApps(account, true);
  const saved = await seedCalendar(account);
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/contacts", { recordId: saved.contactEntityId });
  const contact = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(contact.getByRole("heading", { name: "Jordan Lee", exact: true })).toBeVisible();
  const history = contact.getByRole("region", { name: "Interaction history", exact: true });
  await expect(history.getByText("From meeting:", { exact: true })).toBeVisible();
  const source = history.getByRole("link", { name: "Pricing review", exact: true });
  await expect(source).toHaveAttribute("href", new RegExp(`eventId=${saved.eventId}`));
  const meetings = contact.getByRole("region", { name: "Meetings", exact: true });
  const meeting = meetings.getByRole("link", { name: /Pricing review/ });
  await expect(meeting).toBeVisible();
  await expect(meeting).toHaveAttribute("href", new RegExp(`eventId=${saved.eventId}`));
  await expect(meetings.getByRole("link", { name: /Private review/ })).toHaveCount(0);
  await source.click();
  await expect(page).toHaveURL(new RegExp(`eventId=${saved.eventId}`));
  const panel = page.getByRole("complementary", { name: "Event details", exact: true });
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
  await expect(panel.getByText("Recorded", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(contact.getByRole("heading", { name: "Jordan Lee", exact: true })).toBeVisible();
  await meetings.getByRole("link", { name: /Pricing review/ }).click();
  await expect(page).toHaveURL(new RegExp(`eventId=${saved.eventId}`));
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
});
