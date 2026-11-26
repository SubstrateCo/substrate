import { callTool, createAgent, threadTurn } from "./test-support/agent-work";
import { post, test as workspaceTest, visit } from "./test-support/fixtures";
import { meetingExport, meetingImporter, uploadMeeting } from "./test-support/meetings";
import { expect, type Page } from "@playwright/test";

const test = workspaceTest.extend({
  account: async ({ account }, use) => {
    const r = await account.request.patch("/api/v1/organizations/apps", {
      data: {
        organizationId: account.organizationId,
        enabledApps: ["messages", "agents", "meetings"],
      },
    });
    expect(r.ok()).toBe(true);
    await use(account);
  },
});

async function showNavigation(page: Page) {
  const menu = page.getByRole("button", { name: "Open meeting navigation" });
  if (await menu.isVisible()) await menu.click();
}

test("an agent-created meeting appears live and links both ways to its private source message", async ({
  account,
  client,
}) => {
  const agent = await createAgent(account);
  const dm = await post<{ id: string }>(account, "messaging/conversations", {
    kind: "dm",
    agentIds: [agent.id],
  });
  const source = await post<{ id: string }>(account, "messaging/messages", {
    conversationId: dm.id,
    body: "Log the evening relay call.",
  });
  const user = await client(account),
    { page } = user;
  const desktop = await page.context().newCDPSession(page);
  await desktop.send("Emulation.setTimezoneOverride", { timezoneId: "UTC" });
  await visit(user, undefined, "/meetings");
  await expect(page.getByText("No meetings found")).toBeVisible();
  const { id } = await callTool(
    account,
    agent.id,
    threadTurn(dm.id, source.id, agent.installationId),
    "create_meeting",
    {
      sourceMessageId: source.id,
      meeting: {
        title: "Evening relay",
        startsAt: "2026-11-18T17:30:00-08:00",
        notes: "Check at shift change.",
      },
    },
  );
  const title = page.getByRole("link", { name: "Evening relay", exact: true });
  await expect(title).toHaveAttribute("href", new RegExp(`meetingId=${id}`));
  await title.click();
  const reader = page.getByRole("complementary", { name: "Meeting details" });
  await reader.getByRole("tab", { name: "Sources (1)" }).click();
  await reader
    .getByRole("tabpanel")
    .getByRole("button", { name: "Manual entry", exact: true })
    .click();
  await expect(reader.getByText("Nov 19, 2026, 1:30 AM (UTC)")).toBeVisible();
  await reader.getByRole("link", { name: "Open source message" }).click();
  const thread = page.getByTestId("conversation-aside");
  await expect(thread.getByText("Log the evening relay call.", { exact: true })).toBeVisible();
  await thread
    .getByRole("list", { name: "Linked work" })
    .getByRole("link", { name: /Evening relay/ })
    .click();
  await expect(reader.getByText("Check at shift change.")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("meetingId")).toBe(id);
  await reader.getByRole("tab", { name: "Sources (1)" }).click();
  const link = reader.getByRole("link", { name: "Open source message" });
  await expect(link).toBeVisible();
  const deleted = await account.request.post("/api/v1/messaging/messages/delete", {
    data: { organizationId: account.organizationId, messageId: source.id },
  });
  expect(deleted.ok()).toBe(true);
  await expect(link).toHaveCount(0);
  await expect(reader.getByRole("heading", { name: "Evening relay" })).toBeVisible();
});

test("import, search a transcript, inspect its original, and replay after reopening the archive", async ({
  account,
  client,
}) => {
  const user = await client(account),
    { page } = user;
  const raw = meetingExport(
    "Shift handoff",
    18,
    10,
    [
      "At 00:00:06 both people spoke. Check the latch at 00:00:13.",
      "### Follow-ups\n- Record the latch check at 0:13. Keep `00:00:13` as the file label.",
      "```text\noperator log\n  00:00:13  latch closed\n```",
    ].join("\n\n"),
  );
  await visit(user, undefined, "/meetings");
  await expect(page.getByText("No meetings found")).toBeVisible();
  await showNavigation(page);
  await uploadMeeting(page, raw);
  const table = page.getByRole("table", { name: "All meetings" });
  await expect(table.getByRole("columnheader")).toHaveText([
    "Meeting",
    "Date",
    "Time",
    "Duration",
    "People",
    "Content",
    "Sources",
  ]);
  const search = page.getByRole("searchbox");
  await search.fill("unmentioned phrase");
  await expect(page.getByText("No meetings found")).toBeVisible();
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  await search.fill("violet latch");
  await table.getByRole("link", { name: "Shift handoff" }).press("Enter");
  expect(new URL(page.url()).searchParams.has("q")).toBe(false);
  const reader = page.getByRole("complementary", { name: "Meeting details" });
  await expect(reader.getByText("Written by Example model.")).toBeVisible();
  await expect(
    reader.getByRole("listitem").filter({ hasText: "Record the latch check" }),
  ).toBeVisible();
  await expect(reader.getByRole("button", { name: "00:00:06", exact: true })).toHaveCount(0);
  await expect(reader.getByRole("button", { name: "0:13", exact: true })).toBeVisible();
  await expect(reader.locator("pre")).toHaveJSProperty(
    "textContent",
    "operator log\n  00:00:13  latch closed",
  );
  await reader.getByRole("button", { name: "00:00:13", exact: true }).click();
  await expect(reader.getByText("00:06", { exact: true })).toHaveCount(2);
  await expect(reader.locator('[id^="turn-"]:focus')).toContainText("The violet latch is closed.");
  await reader.getByRole("tab", { name: "Sources (1)" }).click();
  await reader.getByRole("button", { name: /Hex · Anomaly Co/ }).click();
  await expect(reader.getByText("Nov 18, 2026, 10:00 AM (time zone not supplied)")).toBeVisible();
  await reader.getByRole("button", { name: "Inspect original" }).click();
  await expect(reader.locator("pre")).toHaveJSProperty("textContent", raw);
  await reader.getByRole("button", { name: "Close meeting details" }).click();
  await page.reload();
  await showNavigation(page);
  await uploadMeeting(page, raw);
  await expect(page.getByText(/0 new, 0 updated, 0 linked, 1 unchanged/)).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(2);
  await showNavigation(page);
  await uploadMeeting(page, meetingExport("Shift handoff", 18, 10, "A revised summary."));
  await expect(page.getByText(/1 to review/)).toBeVisible();
  await showNavigation(page);
  await page.getByRole("button", { name: "Match review" }).click();
  await page.getByRole("button", { name: "Inspect incoming original" }).press("Enter");
  await expect(page.locator("pre")).toContainText("A revised summary.");
  await page.getByRole("button", { name: "Combine sources" }).click();
  await expect(page.getByText("No matches to review")).toBeVisible();
  await showNavigation(page);
  await page.getByRole("button", { name: "All meetings", exact: true }).click();
  await table.getByRole("link", { name: "Shift handoff" }).click();
  await expect(reader.getByRole("tab", { name: "Sources (2)" })).toBeVisible();
  await showNavigation(page);
  await page
    .getByRole("navigation", { name: "Filter meetings by source" })
    .getByRole("button", { name: "Hex" })
    .press("Enter");
  await expect(page.getByRole("heading", { name: "Hex meetings" })).toBeVisible();
  await expect(table.getByRole("link", { name: "Shift handoff" })).toBeVisible();
  // The sidebar shortcut and the filter bar share one source filter.
  const filters = page.getByRole("group", { name: "Meeting filters" });
  await expect(filters.getByRole("group", { name: "Source is Hex", exact: true })).toBeVisible();
  await filters.getByRole("button", { name: "Remove Source filter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "All meetings" })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("source")).toBe(false);
  await filters.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("option", { name: "Source", exact: true }).click();
  await page.getByRole("option", { name: "Hex", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hex meetings" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]source=hex(?:&|$)/);
});
test("a separate session sees its owner's import via realtime and loses access on sign-out", async ({
  account,
  client,
  freshSession,
}) => {
  const second = await freshSession(account),
    user = await client(second);
  await visit(user, undefined, "/meetings");
  await expect(user.page.getByText("No meetings found")).toBeVisible();
  await (
    await meetingImporter(account)
  )(meetingExport("Evening handoff", 18, 10));
  const row = user.page.getByRole("link", { name: "Evening handoff" });
  await expect(row).toBeVisible();
  const ended = await second.request.post("/api/auth/sign-out", { data: {} });
  expect(ended.ok()).toBe(true);
  await user.page.reload();
  await expect(user.page).not.toHaveURL(/\/meetings(?:\/|\?|$)/);
  await expect(row).toHaveCount(0);
});
test("calendar previews the first six calls in time order; overflow opens the complete day", async ({
  account,
  client,
}) => {
  const user = await client(account),
    { page } = user,
    importMeeting = await meetingImporter(account);
  for (const [day, count] of [
    [18, 7],
    [19, 3],
    [20, 4],
  ]) {
    for (let i = count; i > 0; i--) {
      await importMeeting(meetingExport(`Handoff ${day}-${i}`, day, i));
    }
  }
  await visit(user, undefined, "/meetings", { section: "calendar", month: "2026-11" });
  await expect(page.getByRole("heading", { name: "2026", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "November", exact: true }).click();
  const day = page.getByRole("group", { name: /November 18.*7 meetings/ });
  await expect(day.getByRole("button", { name: /Handoff/ })).toHaveText(
    Array.from({ length: 6 }, (_, i) => `${i + 1}:00 AM Handoff 18-${i + 1}`),
  );
  await expect(
    page
      .getByRole("group", { name: /November 19.*3 meetings/ })
      .getByRole("button", { name: /Handoff/ }),
  ).toHaveCount(3);
  await expect(
    page
      .getByRole("group", { name: /November 20.*4 meetings/ })
      .getByRole("button", { name: /Handoff/ }),
  ).toHaveCount(4);
  await day.getByRole("button", { name: "+1 more" }).click();
  const table = page.getByRole("table", { name: "All meetings" });
  await expect(table.getByRole("row")).toHaveCount(8);
  await table.getByRole("button", { name: "Time", exact: true }).click();
  await expect(table.getByRole("row").nth(1)).toContainText("Handoff 18-1");
  await showNavigation(page);
  await page
    .getByRole("navigation", { name: "Meeting views" })
    .getByRole("button", { name: "Calendar" })
    .click();
  await page.getByRole("radio", { name: "Stats" }).click();
  await expect(page.getByRole("heading", { name: "Meetings per day" })).toBeVisible();
  await expect(page.getByText("14 of 14")).toBeVisible();
  await page
    .getByRole("list", { name: "Busiest days" })
    .getByRole("button", { name: /7 meetings/ })
    .press("Enter");
  await expect(table.getByRole("row")).toHaveCount(8);
});

test("in a narrow window the archive keeps its title column, local search, and reader navigation", async ({
  account,
  client,
}) => {
  const user = await client(account),
    { page } = user,
    importMeeting = await meetingImporter(account);
  await importMeeting(meetingExport("Handoff to the evening operator", 18, 10));
  await page.setViewportSize({ width: 600, height: 800 });
  await visit(user, undefined, "/meetings");
  const table = page.getByRole("table", { name: "All meetings" });
  const title = table.getByRole("link", { name: "Handoff to the evening operator" });
  await expect(title).toBeVisible();
  const cell = table.getByRole("cell").first();
  const left = await cell.evaluate((el) => el.getBoundingClientRect().left);
  const scroll = page.getByRole("region", { name: "Scrollable All meetings table" });
  const distance = await scroll.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
    return el.scrollLeft;
  });
  expect(distance).toBeGreaterThan(100);
  expect(await cell.evaluate((el) => el.getBoundingClientRect().left)).toBeCloseTo(left, 0);
  await page.keyboard.press("/");
  const archiveSearch = page.getByRole("searchbox", { name: "Search meetings" });
  await expect(archiveSearch).toBeFocused();
  await archiveSearch.fill("violet latch");
  await page.getByRole("button", { name: "Search workspace" }).click();
  const globalSearch = page.getByRole("combobox", { name: "Search workspace" });
  await expect(globalSearch).toBeFocused();
  await expect(globalSearch).toHaveValue("");
  await globalSearch.press("Escape");
  await expect(archiveSearch).toHaveValue("violet latch");
  await title.click();
  const reader = page.getByRole("complementary", { name: "Meeting details" });
  await reader.getByRole("button", { name: "Hex", exact: true }).first().click();
  await expect(reader.getByText("Original title")).toBeVisible();
  await reader.getByRole("button", { name: "Close meeting details" }).click();
  await expect(title).toBeFocused();
  await showNavigation(page);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Year", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("sorting the archive includes meetings beyond the current page", async ({
  account,
  client,
}) => {
  const user = await client(account),
    { page } = user,
    importMeeting = await meetingImporter(account);
  // By date descending, the earliest call is on the second page.
  for (let i = 0; i < 51; i++) {
    await importMeeting(
      meetingExport(`Call ${String(i + 1).padStart(2, "0")}`, 1 + Math.floor(i / 3), 8 + (i % 3)),
    );
  }
  await visit(user, undefined, "/meetings");
  const table = page.getByRole("table", { name: "All meetings" });
  const first = table.getByRole("row").nth(1);
  await expect(first).toContainText("Call 51");
  const title = table.getByRole("columnheader", { name: "Meeting", exact: true });
  await title.getByRole("button").click();
  await expect(title).toHaveAttribute("aria-sort", "ascending");
  await expect(first).toContainText("Call 01");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(first).toContainText("Call 51");
  await expect(page.getByText("51–51 of 51 meetings")).toBeVisible();
  await title.getByRole("button").click();
  await expect(title).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByText("1–50 of 51 meetings")).toBeVisible();
});
workspaceTest(
  "enable Meetings, add a meeting manually and read its searchable notes and verbatim transcript",
  async ({ account, client }) => {
    const user = await client(account),
      { page } = user;
    const desktop = await page.context().newCDPSession(page);
    await desktop.send("Emulation.setTimezoneOverride", { timezoneId: "America/New_York" });
    await visit(user, undefined, "/meetings");
    await expect(page.getByRole("heading", { name: "Meetings is disabled" })).toBeVisible();
    await page.getByRole("link", { name: "View apps" }).click();
    const meetings = page.getByRole("switch", { name: "Meetings", exact: true });
    await expect(meetings).not.toBeChecked();
    await expect(
      page
        .getByRole("list", { name: "Meetings agent support" })
        .getByRole("img", { name: /substrate-meetings/ }),
    ).toBeVisible();
    await meetings.click();
    await page
      .getByRole("navigation", { name: "Apps", exact: true })
      .getByRole("link", { name: /^Meetings/ })
      .click();
    await page.getByRole("button", { name: "Add meeting", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill("Unsubmitted call");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("No meetings found")).toBeVisible();
    await page.getByRole("button", { name: "Add meeting", exact: true }).click();
    await dialog.getByLabel("Title").fill("Relay inspection");
    await dialog.getByLabel("Start date and time").fill("2026-03-08T02:30");
    await dialog.getByRole("button", { name: "Save meeting" }).click();
    await expect(
      dialog.getByText("This time does not exist in your time zone. Choose another time."),
    ).toBeVisible();
    await dialog.getByLabel("Start date and time").fill("2026-11-19T10:30");
    await dialog.getByLabel("Duration (minutes)").fill("6.2875");
    await dialog.getByLabel("People").fill("Ren, Lee");
    await dialog.getByLabel("Notes").fill("Replace the relay.");
    await dialog.getByLabel("Transcript").fill("Ren: See the violet cover.\nLee: Yes.");
    await dialog.getByRole("button", { name: "Save meeting" }).click();
    const reader = page.getByRole("complementary", { name: "Meeting details" });
    await expect(reader.getByText("Replace the relay.")).toBeVisible();
    await expect(reader.getByText(/6 min 17\.25 sec/)).toBeVisible();
    await reader.getByRole("tab", { name: "Transcript" }).click();
    await expect(
      reader.getByRole("list", { name: "Manual entry transcript turns" }).getByRole("listitem"),
    ).toHaveJSProperty("textContent", "Ren: See the violet cover.\nLee: Yes.");
    await expect(reader.locator("time[datetime^=PT]")).toHaveCount(0);
    await reader.getByRole("button", { name: "Close meeting details" }).click();
    await page.getByRole("searchbox", { name: "Search meetings" }).fill("violet cover");
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("table")).toContainText("Relay inspection");
  },
);
