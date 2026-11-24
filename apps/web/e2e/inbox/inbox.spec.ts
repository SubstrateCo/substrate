import { test } from "../test-support/inbox";
import { fieldNotesSubject, newsletterImages } from "../test-support/inbox-seed";
import { expect } from "@playwright/test";

test("marking read keeps the email open; moving it to Gmail Trash preserves its conversation", async ({
  inbox: page,
  gmailPages,
}) => {
  const sidebar = page.getByRole("complementary", { name: "Mailbox navigation" });
  const rows = page.getByRole("region", { name: "Messages", exact: true }).getByRole("button");
  const proof = rows.filter({ hasText: "Atlas cover proofs" });
  const reader = page.getByRole("complementary", { name: "Message reader" });
  await sidebar.getByRole("button", { name: "Unread 3", exact: true }).click();
  await proof.click();
  const mark = reader.getByRole("button", { name: "Mark as read" });
  gmailPages.unavailable = true;
  await mark.click();
  await expect(reader.getByRole("alert")).toContainText("Gmail hasn’t confirmed");
  await expect(proof).toBeVisible();
  gmailPages.unavailable = false;
  await mark.click();
  await expect(proof).toHaveCount(0);
  await expect(mark).toHaveCount(0);
  await expect(reader.getByRole("heading", { name: "Atlas cover proofs" })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Unread 2", exact: true })).toBeVisible();
  const trash = reader.getByRole("button", { name: "Move to Trash", exact: true });
  await trash.focus();
  await expect(page.getByRole("tooltip", { name: "Move to Trash" })).toBeVisible();
  await trash.press("Enter");
  const confirm = page.getByRole("dialog", { name: "Move this message to Trash?" });
  await confirm.getByRole("button", { name: "Move to Trash" }).click();
  await expect(reader).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Search messages" })).toBeFocused();
  await sidebar.getByRole("button", { name: "Trash", exact: true }).click();
  await proof.click();
  await expect(reader.getByText("3 messages in this conversation")).toBeVisible();
  await expect(reader.getByRole("button", { name: "Move to Trash" })).toHaveCount(0);
  await reader.getByRole("button", { name: "Close message" }).click();
  await sidebar.getByRole("button", { name: "Inbox", exact: true }).click();
  await expect(proof).toBeVisible();
});

test("switching Inbox off blocks the rail, shortcut and deep link; switching it back on restores cached mail", async ({
  inbox: page,
  client,
  account,
}) => {
  const { page: settings } = await client(account);
  const rail = page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("link", { name: /^Inbox/ });
  const toggle = settings.getByRole("switch", { name: "Inbox", exact: true });
  await expect(rail).toHaveAttribute("aria-current", "page");
  await settings.goto("/settings/organization/apps");
  await toggle.click();
  await settings
    .getByRole("dialog", { name: "Disable Inbox?" })
    .getByRole("button", { name: "Disable Inbox", exact: true })
    .click();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole("heading", { name: "Inbox is disabled" })).toBeVisible();
  await expect(rail).toHaveCount(0);
  await settings.keyboard.press("g");
  await settings.keyboard.press("e");
  await expect(settings).toHaveURL(/\/settings\/organization\/apps/);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox is disabled" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search messages" })).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(rail).toHaveAttribute("aria-current", "page");
  await expect(
    page
      .getByRole("region", { name: "Messages", exact: true })
      .getByRole("button", { name: /Atlas cover proofs/ }),
  ).toBeVisible();
});

test.describe("a mailbox spanning several months", () => {
  test.use({ historySize: 113 });
  test("a change on page two invalidates frozen pages and leaves other unread messages alone", async ({
    inbox: page,
  }) => {
    const nav = page.getByRole("navigation", { name: "Message pages" });
    const next = nav.getByRole("button", { name: "Next page" });
    const rows = page.getByRole("region", { name: "Messages", exact: true }).getByRole("button");
    const match = rows.filter({ hasText: "History message 46" });
    await next.click();
    await expect(nav).toContainText("Page 2");
    await expect(match).toHaveAccessibleName(/^Unread\./);
    await match.click();
    const reader = page.getByRole("complementary", { name: "Message reader" });
    await reader.getByRole("button", { name: "Mark as read" }).click();
    await expect(nav).toContainText("Page 1");
    await reader.getByRole("button", { name: "Close message" }).click();
    await next.click();
    await expect(match).toBeVisible();
    await expect(match).not.toHaveAccessibleName(/^Unread\./);
    await expect(rows.filter({ hasText: "History message 47" })).toHaveAccessibleName(/^Unread\./);
    await nav.getByRole("button", { name: "Previous page" }).click();
    await next.click();
    await expect(match).not.toHaveAccessibleName(/^Unread\./);
  });
  test("loads 50, 50 and 17; retries fill the same page and revisiting a page uses the cache", async ({
    inbox: page,
    gmailPages,
  }) => {
    const rows = page.getByRole("region", { name: "Messages", exact: true }).getByRole("button");
    const nav = page.getByRole("navigation", { name: "Message pages" });
    const next = nav.getByRole("button", { name: "Next page" }),
      previous = nav.getByRole("button", { name: "Previous page" });
    await expect(rows).toHaveCount(50);
    await expect(rows.last()).toContainText("History message 45");
    expect(gmailPages.details).toHaveLength(46);
    expect(gmailPages.details).not.toContain("history-46");
    const sidebar = page.getByRole("complementary", { name: "Mailbox navigation" });
    await expect(sidebar.getByRole("button", { name: "Unread 50", exact: true })).toBeVisible();
    await expect(previous).toBeDisabled();
    gmailPages.unavailable = true;
    await next.click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("History message 50");
    await expect(nav).toContainText("Page 2");
    await expect(nav).toContainText("Choose Next to retry");
    gmailPages.unavailable = false;
    await next.click();
    await expect(rows).toHaveCount(50);
    await expect(nav).toContainText("Page 2");
    await expect(rows.first()).toContainText("History message 46");
    await expect(rows.last()).toContainText("History message 95");
    await expect(sidebar.getByRole("button", { name: "Unread 99", exact: true })).toBeVisible();
    await next.click();
    await expect(rows).toHaveCount(17);
    await expect(rows.first()).toContainText("History message 96");
    await expect(rows.last()).toContainText("History message 112");
    await expect(next).toBeDisabled();
    const calls = gmailPages.lists;
    expect(gmailPages.details).toHaveLength(112);
    expect(gmailPages.details).not.toContain("history-50");
    await previous.click();
    await expect(rows.first()).toContainText("History message 46");
    await previous.click();
    await expect(rows).toHaveCount(50);
    await next.click();
    await next.click();
    await expect(rows.first()).toContainText("History message 96");
    expect(gmailPages.lists).toBe(calls);
    await sidebar.getByRole("button", { name: "Unread 116", exact: true }).click();
    const unreadRows = page
      .getByRole("region", { name: "Messages", exact: true })
      .getByRole("button", { name: /^Unread\./ });
    await expect(unreadRows).toHaveCount(50);
    await next.click();
    await expect(rows).toHaveCount(50);
    await expect(nav).toContainText("Page 2");
    await next.click();
    await expect(rows).toHaveCount(16);
    await expect(next).toBeDisabled();
    await expect(unreadRows).toHaveCount(16);
  });
});

test.describe("a full but discontinuous cache", () => {
  test.use({ historySize: 110, cachedHistory: Array.from({ length: 50 }, (_, i) => 55 + i) });
  test("fills gaps before the oldest cached row and preserves search page boundaries", async ({
    inbox: page,
    gmailPages,
  }) => {
    const rows = page.getByRole("region", { name: "Messages", exact: true }).getByRole("button");
    const nav = page.getByRole("navigation", { name: "Message pages" });
    await expect(rows).toHaveCount(50);
    await expect(rows.last()).toContainText("History message 45");
    expect(gmailPages.details).not.toContain("history-55");
    await page.getByRole("searchbox", { name: "Search messages" }).fill("History message 5");
    await expect(rows).toHaveCount(6);
    await nav.getByRole("button", { name: "Next page" }).click();
    await expect(rows).toHaveCount(11);
    await expect(rows.nth(1)).toContainText("History message 50");
    await expect(nav).toContainText("Page 1");
    await expect(nav.getByRole("button", { name: "Next page" })).toBeDisabled();
    // A full local search can still have newer matches missing from its first 50.
    await page.getByRole("searchbox", { name: "Search messages" }).fill("History message");
    await expect(rows.last()).toContainText("History message 53");
    await nav.getByRole("button", { name: "Next page" }).click();
    await expect(rows.last()).toContainText("History message 49");
    await expect(nav).toContainText("Page 1");
    await nav.getByRole("button", { name: "Next page" }).click();
    await expect(rows.first()).toContainText("History message 50");
    await expect(rows.last()).toContainText("History message 99");
    await expect(nav).toContainText("Page 2");
    await page.getByRole("searchbox", { name: "Search messages" }).fill("History messag");
    await expect(rows.last()).toContainText("History message 49");
    await nav.getByRole("button", { name: "Next page" }).click();
    await expect(nav).toContainText("Page 2");
    await expect(rows.first()).toContainText("History message 50");
  });
});

test("mailbox management updates the unified inbox and evicts an open message on disconnect", async ({
  inbox: page,
}) => {
  let remoteImages = 0;
  await page.route("https://images.example.test/**", (route) => {
    remoteImages++;
    return route.abort();
  });
  const picker = page.getByRole("button", { name: /^Switch mailbox:/ });
  const reader = page.getByRole("complementary", { name: "Message reader" });
  const rows = page.getByRole("region", { name: "Messages", exact: true }).getByRole("button");
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: "Older cached itinerary" })).toHaveCount(1);
  const proof = rows.filter({ hasText: "Atlas cover proofs" });
  await expect(proof.getByLabel("Labels")).toContainText("Review");
  await page.getByRole("button", { name: "Collapse labels", exact: true }).click();
  await expect(proof.getByLabel("Labels")).toContainText("+1");
  await proof.click();
  await expect(reader.getByText("3 messages in this conversation")).toBeVisible();
  await expect(
    reader
      .frameLocator('iframe[title="Email content"]')
      .getByRole("link", { name: "View cover proofs" }),
  ).toHaveAttribute("href", "https://foldpress.example/proofs");
  await reader.getByRole("button", { name: /Alex Rivera.*Sent/ }).click();
  await expect(
    reader.getByText("I’ll compare the two proofs this afternoon.", { exact: true }).last(),
  ).toBeVisible();
  await expect(reader.getByLabel("Labels")).toContainText("Review");
  await expect(reader.getByLabel("Labels")).not.toContainText("+1");
  await reader.getByRole("button", { name: "Show images", exact: true }).click();
  await expect(reader.getByText("Some images are unavailable.")).toBeVisible();
  await expect(
    reader.frameLocator('iframe[title="Email content"]').getByText("Color proof", { exact: true }),
  ).toBeVisible();
  expect(remoteImages).toBe(0);
  const manage = async () => {
    await picker.click();
    await page.getByRole("menuitem", { name: "Manage mailboxes" }).click();
  };
  await manage();
  const settings = page.getByRole("dialog", { name: "Manage mailboxes" });
  const closeSettings = settings
    .locator('[data-slot="dialog-footer"]')
    .getByRole("button", { name: "Close", exact: true });
  const work = settings.getByRole("region", { name: "alex@fieldwork.example" });
  await work.getByRole("button", { name: "Labels", exact: true }).click();
  const options = work.getByRole("button", { name: "Options for Review" });
  await options.click();
  await page.getByRole("menuitem", { name: "Label color" }).click();
  await page.getByRole("menuitemradio", { name: "Rose", exact: true }).click();
  await options.click();
  await page.getByRole("menuitem", { name: "Label color" }).click();
  await expect(page.getByRole("menuitemradio", { name: "Rose", exact: true })).toBeChecked();
  await page.getByRole("menuitem", { name: "Label settings" }).click();
  await page
    .getByRole("group", { name: "In label list" })
    .getByRole("menuitemradio", { name: "Hide", exact: true })
    .click();
  await expect(work.getByText("Hidden filter")).toBeVisible();
  await expect(work.getByText(/Last synced/)).toBeVisible();
  await work.getByRole("textbox", { name: "Nickname (optional)" }).fill("Press");
  await work.getByRole("button", { name: "Save", exact: true }).click();
  await expect(work.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await closeSettings.click();
  await expect(reader.getByText("Press", { exact: true })).toBeVisible();
  await page
    .getByRole("complementary", { name: "Mailbox navigation" })
    .getByRole("button", { name: "Labels", exact: true })
    .click();
  await expect(
    page
      .getByRole("navigation", { name: "Mail labels" })
      .getByRole("button", { name: "Review", exact: true }),
  ).toHaveCount(0);
  await expect(reader.getByLabel("Labels", { exact: true })).toContainText("Review");
  await manage();
  await work.getByRole("button", { name: "Labels", exact: true }).click();
  await work.getByRole("switch", { name: "Show label filters", exact: true }).click();
  await closeSettings.click();
  await expect(page.getByRole("group", { name: "Labels for alex@fieldwork.example" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("group", { name: "Labels for alex.home@personal.example" }),
  ).toBeVisible();
  await manage();
  await work.getByRole("button", { name: "Disconnect", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Disconnect mailbox?" });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(work).toBeVisible();
  await work.getByRole("button", { name: "Disconnect", exact: true }).click();
  await confirm.getByRole("button", { name: "Disconnect mailbox", exact: true }).click();
  await expect(work).toHaveCount(0);
  await expect(settings.getByRole("region", { name: "alex.home@personal.example" })).toBeVisible();
  await closeSettings.click();
  await expect(reader).toHaveCount(0);
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "Atlas cover proofs" })).toHaveCount(0);
  await picker.click();
  await expect(page.getByRole("menuitemradio", { name: /alex@fieldwork\.example/ })).toHaveCount(0);
  await expect(
    page.getByRole("menuitemradio", { name: "alex.home@personal.example" }),
  ).toBeVisible();
});

test("unified unread expands by address; labels filter whole conversations, and invitations remain readable", async ({
  inbox: page,
}) => {
  const sidebar = page.getByRole("complementary", { name: "Mailbox navigation" }),
    picker = page.getByRole("button", { name: /^Switch mailbox:/ });
  const unread = sidebar.getByRole("button", { name: "Unread by mailbox", exact: true });
  await unread.click();
  const group = sidebar.getByRole("group", { name: "Unread by mailbox" });
  const work = group.getByRole("button", { name: /alex@fieldwork.example/ });
  await expect(work).toContainText("2");
  await expect(group.getByRole("button", { name: /alex\.rivera\.demo@gmail\.com/ })).toContainText(
    "1",
  );
  await expect(sidebar.getByRole("button", { name: "Unread 3", exact: true })).toBeVisible();
  await work.click();
  await expect(picker).toHaveText("alex@fieldwork.example");
  await expect(sidebar.getByRole("button", { name: "Unread 2", exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Messages", exact: true }).getByRole("button"),
  ).toHaveCount(2);
  await expect(unread).toHaveCount(0);
  await picker.click();
  await page.getByRole("menuitemradio", { name: "All inboxes" }).click();
  await sidebar.getByRole("button", { name: "Labels", exact: true }).click();
  const labels = sidebar.getByRole("navigation", { name: "Mail labels" });
  await labels
    .getByRole("group", { name: "Labels for alex@fieldwork.example" })
    .getByRole("button", { name: "Review", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search messages" });
  await search.fill("first round");
  const rows = page.getByRole("region", { name: "Messages", exact: true }).getByRole("button");
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  const reader = page.getByRole("complementary", { name: "Message reader" });
  await expect(
    reader.getByText("The first round is ready for review.", { exact: true }).last(),
  ).toBeVisible();
  await reader.getByRole("button", { name: "Close message" }).click();
  await sidebar.getByRole("button", { name: "Inbox", exact: true }).click();
  await search.fill("e\u0301cole");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("ÉCOLE");
  await search.fill("Dates for the gallery visit");
  await rows.first().click();
  await expect(reader.getByRole("link", { name: "Join Google Meet" })).toHaveAttribute(
    "href",
    "https://meet.google.com/abc-defg-hij",
  );
  await expect(reader.getByText("Eastern Time – Toronto")).toBeVisible();
  await expect(
    reader.getByRole("button", { name: "Reconnect to enable Gmail actions" }),
  ).toBeVisible();
  await expect(reader.getByRole("button", { name: "Move to Trash" })).toBeDisabled();
  await reader.getByRole("button", { name: "Full invitation" }).click();
  await expect(reader.getByText(/Join by phone/)).toBeVisible();
});

test("a label menu independently controls the sidebar and row, including conditional and hidden filters", async ({
  inbox: page,
}) => {
  const sidebar = page.getByRole("complementary", { name: "Mailbox navigation" });
  const options = (label: string) =>
    sidebar.getByRole("button", { name: `Options for ${label}`, exact: true });
  const mode = (area: string, value: string) =>
    page
      .getByRole("group", { name: area, exact: true })
      .getByRole("menuitemradio", { name: value, exact: true });
  const proof = page
    .getByRole("region", { name: "Messages", exact: true })
    .getByRole("button", { name: /Atlas cover proofs/ });
  await sidebar.getByRole("button", { name: "Labels", exact: true }).click();
  await options("Review").click();
  await mode("In label list", "Show if unread").click();
  await expect(sidebar.getByRole("button", { name: "Review", exact: true })).toBeVisible();
  await options("Review").click();
  await mode("In message list", "Hide").click();
  await expect(proof.getByLabel("Labels")).not.toContainText("Review");
  await expect(proof.getByLabel("Labels")).toContainText("Atlas / Print");
  await proof.click();
  const reader = page.getByRole("complementary", { name: "Message reader" });
  await expect(reader.getByLabel("Labels")).toContainText("Review");
  await reader.getByRole("button", { name: "Close message" }).click();
  await options("Promotions").click();
  await mode("In label list", "Show if unread").click();
  await expect(options("Promotions")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 720 });
  const view = page.getByRole("button", { name: /Switch view:/ });
  await view.click();
  await expect(page.getByRole("menuitem", { name: "Review", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Promotions", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const compactPicker = page.getByRole("button", { name: "Switch mailbox: All inboxes" });
  await compactPicker.hover();
  await expect(page.getByRole("tooltip", { name: "Switch mailbox: All inboxes" })).toBeVisible();
  await compactPicker.click();
  await page.getByRole("menuitem", { name: "Manage mailboxes" }).click();
  const work = page.getByRole("region", { name: "alex@fieldwork.example", exact: true });
  await work.getByRole("button", { name: "Labels", exact: true }).click();
  await work.getByRole("button", { name: "Options for Promotions" }).click();
  await expect(mode("In label list", "Show if unread")).toBeChecked();
  await mode("In label list", "Show").click();
  await expect(work.getByText("If unread")).toHaveCount(1);
  await page
    .getByRole("dialog", { name: "Manage mailboxes" })
    .getByRole("button", { name: "Close", exact: true })
    .first()
    .click();
  await view.click();
  await expect(page.getByRole("menuitem", { name: "Promotions", exact: true })).toBeVisible();
});

test("all nine folders show matching mail; searching and briefly opening a thread leave it unread", async ({
  inbox: page,
}) => {
  const folders = page.getByRole("navigation", { name: "Mail views" });
  const messages = page.getByRole("region", { name: "Messages", exact: true });
  for (const [name, subject, count] of [
    ["Inbox", "Older cached itinerary", 4],
    ["New 4", "Dates for the gallery visit", 3],
    ["Unread 3", "Atlas cover proofs", 3],
    ["Starred", "Atlas cover proofs", 1],
    ["Drafts 1", "Unsent proposal", 1],
    ["Sent", "Atlas cover proofs", 1],
    ["Archive", "Last month’s film programme", 1],
    ["Spam", "Filtered offer", 1],
    ["Trash", "Discarded invitation", 1],
  ] as const) {
    await folders.getByRole("button", { name, exact: true }).click();
    await expect(messages.getByRole("button")).toHaveCount(count);
    await expect(messages.getByRole("button", { name: new RegExp(subject) })).toBeVisible();
  }
  await folders.getByRole("button", { name: "Unread 3", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search messages" });
  await search.fill("Atlas cover proofs");
  const row = messages.getByRole("button", { name: /^Unread\..*Atlas cover proofs/ });
  await expect(messages.getByRole("button")).toHaveCount(1);
  await row.click();
  await page.getByRole("button", { name: "Close message", exact: true }).click();
  await expect(row).toBeVisible();
  await expect(folders.getByRole("button", { name: "Unread 3", exact: true })).toBeVisible();
});

test("newsletter layouts keep styled actions, responsive posters and opt-in images inside their own document", async ({
  inbox: page,
}) => {
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("region", { name: "Messages", exact: true })
    .getByRole("button", { name: /Last month’s film programme/ })
    .click();
  const reader = page.getByRole("complementary", { name: "Message reader" }),
    doc = reader.frameLocator('iframe[title="Email content"]');
  await expect(doc.getByRole("heading", { name: "Night train" })).toBeVisible();
  const action = doc.getByRole("link", { name: "See the programme" });
  await expect(action).toHaveCSS("background-color", "rgb(41, 56, 88)");
  await page
    .context()
    .route("https://westhaven.example/programme", (route) =>
      route.fulfill({ contentType: "text/plain", body: "Sample programme" }),
    );
  const opening = page.context().waitForEvent("page");
  await action.click();
  const programme = await opening;
  await expect(programme).toHaveURL("https://westhaven.example/programme");
  await programme.close();
  const poster = doc.locator("[data-mail-poster]").first();
  await expect(poster).toHaveCSS("background-image", "none");
  const compact = await poster.boundingBox();
  await reader.getByRole("button", { name: "Show images", exact: true }).click();
  await expect(poster).toHaveCSS("background-image", /data:image\/png/);
  await expect(doc.getByRole("img", { name: "Westhaven Cinema" })).toHaveJSProperty(
    "naturalWidth",
    1,
  );
  const full = await poster.boundingBox();
  expect(full!.height).toBeGreaterThan(compact!.height + 50);
  await reader.getByRole("button", { name: "Hide images", exact: true }).click();
  await expect(poster).toHaveCSS("background-image", "none");
  await page.setViewportSize({ width: 390, height: 720 });
  const one = await doc.getByRole("heading", { name: "Night train" }).boundingBox(),
    two = await doc.getByRole("heading", { name: "Sunday matinee" }).boundingBox();
  expect(two!.y).toBeGreaterThan(one!.y);
  expect(
    await poster.evaluate((e) => {
      const d = e.ownerDocument.documentElement;
      return d.scrollWidth - d.clientWidth;
    }),
  ).toBeLessThanOrEqual(1);
  for (const source of newsletterImages)
    expect(await page.evaluate((url) => performance.getEntriesByName(url).length, source)).toBe(0);
});

test("labels do not shift the mailbox picker; the toolbar stays on one row and dates lead a continuous compact list", async ({
  inbox: page,
}) => {
  await page.setViewportSize({ width: 1400, height: 570 });
  // Mount the resizable layout at the tested size before taking its baseline.
  await page.reload();
  const sidebar = page.getByRole("complementary", { name: "Mailbox navigation" }),
    picker = page.getByRole("button", { name: /^Switch mailbox:/ });
  const bounds = async () =>
    Promise.all(
      [picker, sidebar.getByRole("button", { name: "Inbox", exact: true })].map(async (n) => {
        const b = await n.boundingBox();
        return [b!.x, b!.width];
      }),
    );
  const toggle = sidebar.getByRole("button", { name: "Labels", exact: true });
  const labelFilters = sidebar.getByRole("navigation", { name: "Mail labels" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(labelFilters).toBeHidden();
  const before = await bounds();
  await toggle.click();
  await expect(labelFilters.getByRole("button", { name: "Review", exact: true })).toBeVisible();
  expect(await bounds()).toEqual(before);
  await toggle.click();
  await expect(labelFilters).toBeHidden();
  expect(await bounds()).toEqual(before);
  const rows = page.getByRole("region", { name: "Messages", exact: true });
  await expect(rows.getByRole("heading")).toHaveCount(0);
  const proof = rows.getByRole("button", { name: /Atlas cover proofs/ });
  const d = await proof.locator("time").boundingBox(),
    from = await proof.getByText("Mira Park", { exact: true }).boundingBox(),
    labels = await proof.getByLabel("Labels").boundingBox(),
    subj = await proof.getByText("Atlas cover proofs", { exact: true }).boundingBox();
  expect(d!.x).toBeLessThan(from!.x);
  expect(from!.x).toBeLessThan(labels!.x);
  expect(labels!.x).toBeLessThan(subj!.x);
  const times = await rows.locator("button:visible time").evaluateAll((nodes) =>
    nodes.map((node) => ({
      today: new Date(node.getAttribute("datetime")!).toDateString() === new Date().toDateString(),
      display: node.textContent,
    })),
  );
  for (const t of times)
    expect(t.display).toMatch(
      t.today ? /^\d{1,2}:\d{2} [AP]M$/ : /^[A-Z][a-z]{2} \d{1,2}(, \d{4})?$/,
    );
  const toolbar = page
    .locator('header[data-slot="page-header"]')
    .filter({ has: page.getByRole("searchbox", { name: "Search messages" }) });
  await expect(toolbar.getByRole("button", { name: "Sync mail" })).toBeVisible();
  await expect(toolbar).not.toContainText(/conversations?|threads?|unread messages/i);
  const name = await toolbar.getByRole("heading", { name: "Inbox", exact: true }).boundingBox(),
    search = await toolbar.getByRole("searchbox").boundingBox();
  expect(Math.abs(name!.y + name!.height / 2 - (search!.y + search!.height / 2))).toBeLessThan(2);
});

test("wide Inbox rows fit labels beside the subject and disclose exactly how many are hidden", async ({
  inbox: page,
}) => {
  const list = page.getByRole("region", { name: "Messages", exact: true });
  const row = list.getByRole("button", { name: /Notes from ÉCOLE/ });
  const labels = row.getByLabel("Labels", { exact: true });
  const chips = labels.locator(":scope > span:visible");
  for (const width of [2200, 1100, 2200]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(row).toBeVisible();
    if (width === 2200) await expect(chips).toHaveCount(5);
    else await expect(chips.last()).toHaveText(/^\+\d+$/);
    // The labels refit after a resize observer runs, so check one settled layout at a time.
    await expect(async () => {
      const shown = await chips.evaluateAll((items) =>
        items.map((item) => {
          const { y, height } = item.getBoundingClientRect();
          return { text: item.textContent, center: y + height / 2 };
        }),
      );
      const hidden = shown.at(-1)?.text.match(/^\+(\d+)$/);
      expect(hidden ? shown.length - 1 + Number(hidden[1]) : shown.length).toBe(5);
      const subject = await row.getByText(fieldNotesSubject, { exact: true }).boundingBox();
      const centers = [...shown.map((chip) => chip.center), subject!.y + subject!.height / 2];
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(1);
      const plain = await list
        .getByRole("button", { name: /Dates for the gallery visit/ })
        .boundingBox();
      expect((await row.boundingBox())!.height).toBeLessThanOrEqual(plain!.height + 6);
    }).toPass();
  }
});
