import type { InteractionKind } from "@substrate/contracts/context/interactions";

import { createCrm, type CrmMutation } from "../../../server/integration/test-support/crm";
import { conversation, post, visit, type Actor } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect, type Page } from "@playwright/test";

const kinds: InteractionKind[] = ["email", "meeting", "call", "message", "note", "other"];
const summaries = {
  email: "Shared the revised onboarding plan and confirmed next steps.",
  meeting: "Reviewed the pilot scope and agreed on a two-week trial.",
  call: "Clarified the integration requirements and rollout timeline.",
  message: "Confirmed the demo time and shared the meeting agenda.",
  note: "Recorded context from the account handoff and product feedback.",
  other: "Followed up after the community roundtable.",
};

async function seedInteractions(
  actor: Actor,
  interactions: Extract<CrmMutation, { action: "createInteraction" }>[],
) {
  for (let start = 0; start < interactions.length; start += 4)
    await Promise.all(interactions.slice(start, start + 4).map((input) => createCrm(actor, input)));
}

async function sampleInteractions(actor: Actor) {
  const people = ["Maya Chen", "Alex Rivera"];
  const contacts = await Promise.all(
    people.map((displayName) => createCrm(actor, { action: "createContact", displayName })),
  );
  const source = await conversation(actor);
  const today = new Date();
  // One page plus one row exercises timeline navigation; only six rows need to be recent.
  const interactions = Array.from({ length: 51 }, (_, i) => {
    const kind = kinds[i % kinds.length]!;
    const occurredAt = new Date(today);
    occurredAt.setDate(occurredAt.getDate() - (i < kinds.length ? 1 : 10));
    occurredAt.setHours(12, 0, i, 0);
    const duration = { meeting: 30, call: 15, email: 0, message: 0, note: 0, other: 0 }[kind];
    return {
      action: "createInteraction" as const,
      contactEntityId: contacts[i % contacts.length]!.entityId,
      kind,
      occurredAt: occurredAt.toISOString(),
      endedAt: duration ? new Date(+occurredAt + duration * 60000).toISOString() : null,
      summary: summaries[kind],
    };
  });
  const message = await post<{ id: string }>(actor, "messaging/messages", {
    conversationId: source.id,
    body: interactions[0]!.summary,
  });
  await createCrm(actor, {
    ...interactions[0]!,
    action: "publishInteraction",
    messageId: message.id,
    consentToContactAudience: true,
  });
  await seedInteractions(actor, interactions.slice(1));
  return contacts;
}

function total(page: Page) {
  return page.getByRole("definition").first();
}

/** Adds a filter through the "Filter" button. */
async function addFilter(page: Page, field: string, option: string) {
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("option", { name: field, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(
    page.getByRole("group", { name: `${field} is ${option}`, exact: true }),
  ).toBeVisible();
}

/** Changes an active filter's value in place. */
async function changeFilter(page: Page, field: string, current: string, option: string) {
  await page.getByRole("button", { name: `${field}: ${current}`, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(
    page.getByRole("group", { name: `${field} is ${option}`, exact: true }),
  ).toBeVisible();
}

test("dashboard and timeline use real sample records in dark mode", async ({ account, client }) => {
  test.setTimeout(30_000);
  await sampleInteractions(account);
  const user = await client(account);
  const { page } = user;
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await visit(user, undefined, "/dashboard");
  await page
    .getByRole("navigation", { name: "Apps", exact: true })
    .getByRole("link", { name: "Interactions", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Interaction dashboard", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Interactions views" })
      .getByRole("link", { name: "Timeline", exact: true }),
  ).toHaveCount(0);
  await expect(total(page)).toHaveText("51");
  await expect(
    page.getByRole("group", { name: "Period is Last 30 days", exact: true }),
  ).toBeVisible();
  // The period is required, so it has no remove button.
  await expect(page.getByRole("button", { name: "Remove Period filter", exact: true })).toHaveCount(
    0,
  );
  // The dashboard opens on the latest day with interactions, so the day's table has rows.
  await expect(page.getByLabel(/^Selected day: /)).toBeVisible();
  await expect(page.getByRole("link", { name: /^Open interaction:/ }).first()).toBeVisible();
  await page.getByRole("button", { name: "Period: Last 30 days", exact: true }).click();
  // The dashboard has no all-time view.
  await expect(page.getByRole("option", { name: "All time", exact: true })).toHaveCount(0);
  await page.getByRole("option", { name: "Last 7 days", exact: true }).click();
  await expect(total(page)).toHaveText("6");
  await expect(page.locator("html")).toHaveClass(/dark/);
  const chart = page.getByRole("img", {
    name: "Daily interaction activity over 7 days",
    exact: true,
  });
  await expect(chart).toBeVisible();
  await chart.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("status").filter({ hasText: "Email" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "Interaction dashboard", exact: true }).click();
  await expect(
    page.getByText("A clear picture of your contact activity.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("View daily counts", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await changeFilter(page, "Period", "Last 7 days", "Last 30 days");
  await expect(total(page)).toHaveText("51");
  await expect(
    page
      .getByRole("term")
      .filter({ hasText: "Published from messages" })
      .locator("..")
      .getByRole("definition")
      .first(),
  ).toHaveText("1");
  await expect(
    page.getByRole("img", { name: "Daily interaction activity over 30 days", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View timeline", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Interaction timeline", exact: true }),
  ).toBeVisible();
  const list = page
    .getByRole("region", { name: "Interactions workspace", exact: true })
    .getByRole("list", { name: "Interactions", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(50);
  await page
    .getByRole("link", { name: `Open interaction: ${summaries.email}`, exact: true })
    .first()
    .click();
  const sourceDetail = page.getByRole("dialog", { name: "Interaction", exact: true });
  await expect(
    sourceDetail.getByRole("heading", { name: "Email with Maya Chen", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("recordId")).toBeTruthy();
  await expect(
    sourceDetail
      .getByRole("region", { name: "Source messages", exact: true })
      .getByText(summaries.email, { exact: true }),
  ).toBeVisible();
  // The sheet leaves the timeline usable, and another interaction replaces its content in place.
  const shell = await sourceDetail.elementHandle();
  await list
    .getByRole("link", { name: `Open interaction: ${summaries.meeting}`, exact: true })
    .first()
    .click();
  await expect(
    sourceDetail.getByRole("heading", { name: "Meeting with Alex Rivera", exact: true }),
  ).toBeVisible();
  expect(await sourceDetail.evaluate((node, previous) => node === previous, shell)).toBe(true);
  const meetingUrl = page.url();
  await page.reload();
  await expect(
    sourceDetail.getByRole("heading", { name: "Meeting with Alex Rivera", exact: true }),
  ).toBeVisible();
  expect(page.url()).toBe(meetingUrl);
  await sourceDetail.getByRole("button", { name: "Close interaction", exact: true }).click();
  await expect(sourceDetail).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("recordId")).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await addFilter(page, "Origin", "Published from message");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Remove Origin filter", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(50);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeEnabled();
  await page.getByRole("searchbox", { name: "Search interactions", exact: true }).fill("Maya");
  await expect(list.getByRole("listitem")).toHaveCount(26);
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toHaveCount(0);
  await addFilter(page, "Type", "Email");
  await expect(list.getByRole("listitem")).toHaveCount(9);
  await list.getByRole("link", { name: "Maya Chen", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Maya Chen", exact: true })).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Interaction timeline", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(list.getByRole("listitem")).toHaveCount(50);
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(total(page)).toHaveText("51");
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(
    page.getByRole("img", { name: "Daily interaction activity over 30 days", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "View timeline", exact: true }).click();
  await expect(
    page.getByRole("searchbox", { name: "Search interactions", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("dashboard selects today, browses day-specific pages, and handles empty days", async ({
  account,
  client,
}) => {
  test.setTimeout(60_000);
  const contact = await createCrm(account, {
    action: "createContact",
    displayName: "Daily activity contact",
  });
  const now = new Date();
  const timestamps = [0, 1, 20].map((offset) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset, 12).toISOString(),
  );
  await seedInteractions(
    account,
    [51, 2, 1].flatMap((count, offset) =>
      Array.from({ length: count }, (_, i) => ({
        action: "createInteraction" as const,
        contactEntityId: contact.entityId,
        kind: "message",
        occurredAt: timestamps[offset]!,
        summary: `${["Today", "Yesterday", "Earlier"][offset]} interaction ${i + 1}`,
      })),
    ),
  );
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/interactions");
  await expect(total(page)).toHaveText("54");
  const chart = page.getByRole("img", {
    name: "Daily interaction activity over 30 days",
    exact: true,
  });
  const rows = page.getByRole("link", { name: /^Open interaction:/ });
  await expect(page.getByLabel("Selected day: Today", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(50);
  await expect(rows.first()).toHaveAccessibleName(/Today interaction/);
  const table = page.getByRole("table", { name: "Day’s interactions", exact: true });
  await expect(table.getByRole("columnheader", { name: "Summary", exact: true })).toBeVisible();
  const rowHeight = await table
    .locator("tbody tr")
    .first()
    .evaluate((row) => row.getBoundingClientRect().height);
  expect(rowHeight).toBeLessThanOrEqual(40);
  await expect(page.getByRole("heading", { name: "Interaction mix", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next day", exact: true })).toBeDisabled();
  const nextDayX = (await page
    .getByRole("button", { name: "Next day", exact: true })
    .boundingBox())!.x;
  await page.getByRole("button", { name: "Previous day", exact: true }).click();
  await expect(page.getByLabel("Selected day: Yesterday", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(2);
  await page.getByRole("button", { name: "Next day", exact: true }).click();
  await expect(page.getByLabel("Selected day: Today", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(50);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAccessibleName(/Today interaction/);

  await chart.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Selected day: Yesterday", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAccessibleName(/Yesterday interaction/);
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toHaveCount(0);
  await expect(total(page)).toHaveText("54");

  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "No interactions on this day", exact: true }),
  ).toBeVisible();
  await expect(rows).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous day", exact: true })).toBeDisabled();
  expect(
    (await page.getByRole("button", { name: "Next day", exact: true }).boundingBox())!.x,
  ).toBeCloseTo(nextDayX, 1);

  await chart.focus();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Selected day: Today", { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(50);
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
  await changeFilter(page, "Period", "Last 30 days", "Last 7 days");
  await expect(total(page)).toHaveText("53");
  await expect(page.getByLabel("Selected day: Today", { exact: true })).toBeVisible();
  for (const width of [1440, 600]) {
    await page.setViewportSize({ width, height: 900 });
    const dailyChart = page.getByRole("img", {
      name: "Daily interaction activity over 7 days",
      exact: true,
    });
    await expect
      .poll(async () => {
        const box = await dailyChart.boundingBox();
        return !!box && box.x + box.width <= width;
      })
      .toBe(true);
    const tip = page.getByRole("status").filter({ hasText: "Message" });
    // The chart redraws its bars and tooltip offset after the resize settles, so measure, hover,
    // and check together against the bar as it is now.
    let bar = { x: 0, y: 0, width: 0, height: 0 };
    await expect(async () => {
      bar = await dailyChart.locator("rect").evaluateAll((rectangles) => {
        const bounds = rectangles
          .map((rect) => rect.getBoundingClientRect())
          .filter((rect) => rect.width > 0 && rect.height > 0 && rect.width < 150)
          .sort((a, b) => b.x - a.x || b.height - a.height)[0]!;
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
      });
      await page.mouse.move(0, 0);
      await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
      await expect(tip).toBeVisible({ timeout: 1_000 });
      const box = await tip.boundingBox();
      expect(!!box && (box.x + box.width <= bar.x || box.x >= bar.x + bar.width)).toBe(true);
    }).toPass();
    await page.mouse.click(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await expect(page.getByLabel("Selected day: Today", { exact: true })).toBeVisible();
    await expect(dailyChart).toBeFocused();
    expect(await dailyChart.evaluate((chart) => getComputedStyle(chart).outlineStyle)).toBe("none");
    await page.getByRole("button", { name: "Previous day", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(dailyChart).toBeFocused();
    expect(await dailyChart.evaluate((chart) => chart.matches(":focus-visible"))).toBe(true);
    expect(await dailyChart.evaluate((chart) => getComputedStyle(chart).outlineStyle)).not.toBe(
      "none",
    );
  }
});

test("day table cells keep their content inside their columns", async ({ account, client }) => {
  const contact = await createCrm(account, {
    action: "createContact",
    displayName: "Alexandra Montgomery-Fairweather",
  });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  // "10:48 PM" is one of the widest times the Time column shows.
  yesterday.setHours(22, 48, 0, 0);
  await seedInteractions(
    account,
    kinds.map((kind, i) => ({
      action: "createInteraction" as const,
      contactEntityId: contact.entityId,
      kind,
      occurredAt: new Date(+yesterday + i * 1000).toISOString(),
      summary: summaries[kind],
    })),
  );
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/interactions");
  const table = page.getByRole("table", { name: "Day’s interactions", exact: true });
  for (const [width, colorScheme] of [
    [1440, "light"],
    [1440, "dark"],
    [1100, "light"],
    [900, "light"],
    [700, "light"],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme });
    await expect(table.getByRole("cell", { name: "Internal note", exact: true })).toBeVisible();
    // Origin hides in a container narrower than 48rem.
    if (width === 1440)
      await expect(table.getByRole("cell", { name: "Manual", exact: true }).first()).toBeVisible();
    // Each text box, clipped by any ancestor that hides overflow, stays in its cell's content box.
    const overflows = await table.locator("tbody td").evaluateAll((cells) =>
      cells.flatMap((cell) => {
        const style = getComputedStyle(cell);
        const bounds = cell.getBoundingClientRect();
        const left = bounds.left + parseFloat(style.paddingLeft) - 0.5;
        const right = bounds.right - parseFloat(style.paddingRight) + 0.5;
        const texts = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        const found: string[] = [];
        for (let text = texts.nextNode(); text; text = texts.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(text);
          const box = range.getBoundingClientRect();
          if (!text.textContent?.trim() || box.width === 0) continue;
          let visibleLeft = box.left;
          let visibleRight = box.right;
          for (let node = text.parentElement; node && node !== cell; node = node.parentElement) {
            if (getComputedStyle(node).overflowX === "visible") continue;
            const clip = node.getBoundingClientRect();
            visibleLeft = Math.max(visibleLeft, clip.left);
            visibleRight = Math.min(visibleRight, clip.right);
          }
          if (visibleLeft < left || visibleRight > right) found.push(text.textContent);
        }
        return found;
      }),
    );
    expect(overflows, `${width}px ${colorScheme}`).toEqual([]);
  }
});

test("create interactions, browse directories and profiles, and inspect source context", async ({
  account,
  client,
}) => {
  test.setTimeout(45_000);
  const contact = await createCrm(account, {
    action: "createContact",
    displayName: "Morgan Stone",
  });
  const customer = await createCrm(account, { action: "createAccount", name: "Northstar Labs" });
  await createCrm(account, {
    action: "setAffiliation",
    contactEntityId: contact.entityId,
    accountEntityId: customer.entityId,
    title: "Founder",
    isPrimary: true,
  });
  const user = await client(account),
    { page } = user;
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/interactions");
  await page.getByRole("button", { name: "New interaction", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New interaction", exact: true });
  await expect(
    dialog.getByRole("button", { name: "Create interaction", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("combobox", { name: "Contact", exact: true }).click();
  await page.getByRole("option", { name: "Morgan Stone", exact: true }).click();
  const date = new Date();
  const localDay = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  await dialog.getByLabel("Occurred at", { exact: true }).fill(`${localDay}T10:00`);
  await dialog.getByLabel("Ended at (optional)", { exact: true }).fill(`${localDay}T10:20`);
  await dialog
    .getByLabel("Summary", { exact: true })
    .fill("Agreed on a pilot with the operations team.");
  await dialog.getByRole("button", { name: "Create interaction", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(total(page)).toHaveText("1");
  await page.reload();
  await expect(total(page)).toHaveText("1");
  await page.getByRole("link", { name: "People", exact: true }).click();
  await expect(
    page
      .getByRole("table", { name: "People directory", exact: true })
      .getByText("Morgan Stone", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("link", { name: "View timeline", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: "Open interaction: Agreed on a pilot with the operations team.",
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (
        document.querySelector('table[aria-label="People directory"] tbody tr[aria-hidden="true"]')
      )
        document.documentElement.setAttribute("data-loading-flash", "true");
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("stop-loading-check", () => observer.disconnect(), { once: true });
  });
  await page.getByRole("link", { name: "People", exact: true }).click();
  await expect(page.getByRole("table", { name: "People directory", exact: true })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-loading-flash", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("stop-loading-check")));
  await page.getByRole("link", { name: "Morgan Stone", exact: true }).click();
  await page.getByRole("tab", { name: "Relationship map", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Relationship map", exact: true })
      .getByRole("link", { name: "Northstar Labs", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Organizations", exact: true }).click();
  await page
    .getByRole("table", { name: "Organization directory", exact: true })
    .getByRole("link", { name: "Northstar Labs", exact: true })
    .click();
  await expect(
    page.getByRole("link", {
      name: "Open interaction: Agreed on a pilot with the operations team.",
      exact: true,
    }),
  ).toBeVisible();
  await changeFilter(page, "Scope", "Related contacts", "Explicit links");
  await expect(
    page.getByRole("heading", { name: "No interactions in this period", exact: true }),
  ).toBeVisible();
  await changeFilter(page, "Scope", "Explicit links", "Related contacts");
  await page
    .getByRole("link", {
      name: "Open interaction: Agreed on a pilot with the operations team.",
      exact: true,
    })
    .click();
  const details = page.getByRole("dialog", { name: "Interaction", exact: true });
  await expect(
    details.getByText("Agreed on a pilot with the operations team.", { exact: true }),
  ).toBeVisible();
  const tools = details.getByRole("group", { name: "Interaction actions", exact: true });
  await expect(tools.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: "Copy link", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: "More actions", exact: true })).toBeVisible();
  await expect(details.getByRole("heading", { name: "Linked records", exact: true })).toBeVisible();
  await page.reload();
  await expect(details).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
});

test("empty dark dashboard and timeline do not invent activity", async ({ account, client }) => {
  expect(
    (
      await account.request.post("/api/auth/organization/update", {
        data: { organizationId: account.organizationId, data: { name: "Substrate demo" } },
      })
    ).ok(),
  ).toBe(true);
  const user = await client(account);
  const { page } = user;
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/interactions");
  await expect(total(page)).toHaveText("0");
  await expect(
    page.getByRole("heading", { name: "No interactions in this period", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: /Daily interaction activity/ })).toHaveCount(0);
  await expect(page.locator("html")).toHaveClass(/dark/);
  await visit(user, undefined, "/interactions", { section: "timeline" });
  await expect(
    page.getByRole("heading", { name: "No interactions in this period", exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search interactions", exact: true }).fill("unmatched");
  await expect(
    page.getByRole("heading", { name: "No matching interactions", exact: true }),
  ).toBeVisible();
});

test("people and organization tables paginate and reset after filtering", async ({
  account,
  client,
}) => {
  test.setTimeout(60_000);
  const now = new Date();
  for (let start = 0; start < 26; start += 4) {
    await Promise.all(
      Array.from({ length: Math.min(4, 26 - start) }, async (_, offset) => {
        const i = start + offset;
        const suffix = String(i).padStart(2, "0");
        const contact = await createCrm(account, {
          action: "createContact",
          displayName: `Person ${suffix}`,
        });
        const customer = await createCrm(account, {
          action: "createAccount",
          name: `Company ${suffix}`,
        });
        await createCrm(account, {
          action: "setAffiliation",
          contactEntityId: contact.entityId,
          accountEntityId: customer.entityId,
          title: "Founder",
        });
        await createCrm(account, {
          action: "createInteraction",
          contactEntityId: contact.entityId,
          kind: "note",
          occurredAt: new Date(+now + i).toISOString(),
          summary: "Introduced the workspace.",
        });
      }),
    );
  }
  const user = await client(account),
    { page } = user;
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/interactions", { section: "people", days: "all" });
  for (const type of ["people", "accounts"] as const) {
    if (type === "accounts")
      await page.getByRole("link", { name: "Organizations", exact: true }).click();
    await page.getByRole("button", { name: /^Sort: / }).click();
    await page.getByRole("menuitemradio", { name: "Name", exact: true }).click();
    const table = page.getByRole("table", {
      name: type === "people" ? "People directory" : "Organization directory",
      exact: true,
    });
    await expect(table.getByRole("row")).toHaveCount(26);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
    await expect(
      table.getByRole("link", {
        name: type === "people" ? "Person 25" : "Company 25",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Next page", exact: true })).toBeDisabled();
    await page.getByRole("combobox", { name: "Rows per page", exact: true }).click();
    await page.getByRole("option", { name: "50", exact: true }).click();
    await expect(table.getByRole("row")).toHaveCount(27);
    await expect(page.getByText("Page 1", { exact: true })).toBeVisible();
    await page
      .getByRole("searchbox", {
        name: type === "people" ? "Search people" : "Search organizations",
        exact: true,
      })
      .fill(type === "people" ? "Person 25" : "Company 25");
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
  }
});
