import { seedCalendar } from "../test-support/calendar";
import { test, visit, type Actor } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
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

  const apps = page.getByRole("navigation", { name: "Apps", exact: true });
  await apps.getByRole("link", { name: /^Calendar/ }).click();
  await expect(page).toHaveURL(/\/calendar/);
  const notice = page.getByRole("status").filter({ hasText: "No calendars connected" });
  await expect(notice).toBeVisible();
  await notice.getByRole("link", { name: "Connect a calendar", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/user\/calendars/);
});

test("a disabled Calendar explains how to enable it and the owner enables it in apps", async ({
  account,
  client,
}) => {
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

test("month view persists and shares event selection, filtering, navigation and Today", async ({
  account,
  client,
}) => {
  await setApps(account, true);
  const saved = await seedCalendar(account);
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/calendar", { date: "2020-01-15" });
  const picker = page.getByRole("combobox", { name: "Calendar view", exact: true });
  await picker.click();
  await expect(page.getByRole("option", { name: "Agenda", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Week", exact: true })).toBeVisible();
  await captureScreenshot(page, "calendar-view-dropdown");
  await page.getByRole("option", { name: "Month", exact: true }).click();
  const month = page.getByRole("region", { name: "Month", exact: true });
  await expect(month).toBeVisible();
  await expect(page.getByRole("heading", { name: "January 2020", exact: true })).toBeVisible();
  const event = month.getByRole("link", { name: /Pricing review/ });
  await event.click();
  await expect(page).toHaveURL(new RegExp(`eventId=${saved.eventId}`));
  await expect(event).toHaveAttribute("aria-current", "page");
  const panel = page.getByRole("dialog", { name: "Event", exact: true });
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
  await captureScreenshot(page, "calendar-month-selected-event");
  await page.reload();
  await expect(month).toBeVisible();
  await expect(event).toHaveAttribute("aria-current", "page");
  await panel.getByRole("button", { name: "Close event", exact: true }).click();
  // Reopen without a view in the URL: localStorage, not search state, restores Month.
  await visit(user, undefined, "/calendar", { date: "2020-01-15" });
  await expect(picker).toHaveText("Month");
  await expect(month).toBeVisible();
  await expect(event).toBeVisible();
  await page.reload();
  await expect(picker).toHaveText("Month");
  await expect(event).toBeVisible();
  // The sidebar checkbox and the filter bar's "Calendar is not" pill change the same choice.
  const calendar = page.getByRole("checkbox", { name: "Customer meetings", exact: true });
  const pill = page.getByRole("group", { name: "Calendar is not Customer meetings", exact: true });
  await calendar.uncheck();
  await expect(event).toHaveCount(0);
  await expect(pill).toBeVisible();
  await pill.getByRole("button", { name: "Remove Calendar filter", exact: true }).click();
  await expect(pill).toHaveCount(0);
  await expect(calendar).toBeChecked();
  await expect(event).toBeVisible();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("option", { name: "Calendar", exact: true }).click();
  // Like the sidebar, the menu ticks the shown calendars; unticking one hides it.
  const option = page.getByRole("option", { name: "Customer meetings", exact: true });
  await expect(option).toHaveAttribute("aria-checked", "true");
  await option.click();
  await expect(pill).toBeVisible();
  await expect(calendar).not.toBeChecked();
  await expect(event).toHaveCount(0);
  await pill.getByRole("button", { name: "Calendar: Customer meetings", exact: true }).click();
  await expect(option).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await calendar.check();
  await expect(pill).toHaveCount(0);
  await expect(event).toBeVisible();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(page.getByRole("heading", { name: "February 2020", exact: true })).toBeVisible();
  await expect(month.locator("time[datetime='2020-02-29']")).toBeVisible();
  await expect(event).toHaveCount(0);
  await page.getByRole("button", { name: "Previous month", exact: true }).click();
  await expect(event).toBeVisible();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).not.toHaveURL(/date=/);
  await expect(month.locator("time[aria-current='date']")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Today", exact: true })).toBeDisabled();
  // A shared URL's explicit choice takes priority over the saved preference.
  await visit(user, undefined, "/calendar", { view: "week", date: "2020-01-15" });
  await expect(picker).toHaveText("Week");
  await expect(month).toHaveCount(0);
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
  const panel = page.getByRole("dialog", { name: "Event", exact: true });
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
  const selectedRow = page.getByRole("link", { name: /Pricing review/ });
  await page.getByRole("heading", { name: "Pricing review", exact: true }).hover();
  const selectedBackground = await selectedRow.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  // The event sheet covers the row's center.
  await selectedRow.hover({ position: { x: 8, y: 8 } });
  await expect
    .poll(() => selectedRow.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(selectedBackground);
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
  const panel = page.getByRole("dialog", { name: "Event", exact: true });
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
  await expect(panel.getByText("Recorded", { exact: true })).toBeVisible();
  await page.goBack();
  await expect(contact.getByRole("heading", { name: "Jordan Lee", exact: true })).toBeVisible();
  await meetings.getByRole("link", { name: /Pricing review/ }).click();
  await expect(page).toHaveURL(new RegExp(`eventId=${saved.eventId}`));
  await expect(panel.getByRole("heading", { name: "Pricing review", exact: true })).toBeVisible();
});
