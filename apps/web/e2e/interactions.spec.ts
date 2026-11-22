import type { InteractionKind } from "@substrate/contracts/context/interactions";

import { createCrm } from "../../server/integration/test-support/crm";
import { conversation, post, test, visit, type Actor } from "./test-support/fixtures";
import { expect, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const kinds: InteractionKind[] = ["email", "meeting", "call", "message", "note", "other"];
const summaries = {
  email: "Shared the revised onboarding plan and confirmed next steps.",
  meeting: "Reviewed the pilot scope and agreed on a two-week trial.",
  call: "Clarified the integration requirements and rollout timeline.",
  message: "Confirmed the demo time and shared the meeting agenda.",
  note: "Recorded context from the account handoff and product feedback.",
  other: "Followed up after the community roundtable.",
};

async function sampleInteractions(actor: Actor) {
  const people = ["Maya Chen", "Alex Rivera"];
  const contacts = [];
  for (const displayName of people)
    contacts.push(await createCrm(actor, { action: "createContact", displayName }));
  const source = await conversation(actor);
  // One page plus one row exercises timeline navigation; only six rows need to be recent.
  for (let i = 0; i < 51; i++) {
    const kind = kinds[i % kinds.length]!;
    const occurredAt = new Date();
    occurredAt.setDate(occurredAt.getDate() - (i < kinds.length ? 1 : 10));
    occurredAt.setHours(12, 0, i, 0);
    const duration = { meeting: 30, call: 15, email: 0, message: 0, note: 0, other: 0 }[kind];
    const fields = {
      contactEntityId: contacts[i % contacts.length]!.entityId,
      kind,
      occurredAt: occurredAt.toISOString(),
      endedAt: duration ? new Date(+occurredAt + duration * 60000).toISOString() : null,
      summary: summaries[kind],
    };
    if (i === 0) {
      const message = await post<{ id: string }>(actor, "messaging/messages", {
        conversationId: source.id,
        body: fields.summary,
      });
      await createCrm(actor, {
        action: "publishInteraction",
        ...fields,
        messageId: message.id,
        consentToContactAudience: true,
      });
    } else await createCrm(actor, { action: "createInteraction", ...fields });
  }
  return contacts;
}

async function capture(page: Page, name: string) {
  const directory = resolve(".runtime/interactions-screenshots");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${name}.png`);
  await page.screenshot({ path, animations: "disabled", fullPage: true });
  await test.info().attach(name, { path, contentType: "image/png" });
}

function total(page: Page) {
  return page.getByRole("definition").first();
}

test("dashboard and timeline use real sample records in dark mode", async ({ account, client }) => {
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
  await capture(page, "dashboard-7-days-dark");
  await expect(
    page.getByText("A clear picture of your contact activity.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("View daily counts", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await page.getByRole("radio", { name: "Last 30 days", exact: true }).click();
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
  await capture(page, "dashboard-30-days-dark");
  await page.getByRole("link", { name: "View timeline", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Interaction timeline", exact: true }),
  ).toBeVisible();
  const list = page
    .getByRole("region", { name: "Interactions workspace", exact: true })
    .getByRole("list")
    .last();
  await expect(list.getByRole("listitem")).toHaveCount(50);
  await capture(page, "timeline-dark");
  await page
    .getByRole("link", { name: `Open interaction: ${summaries.email}`, exact: true })
    .first()
    .click();
  const sourceDetail = page.getByRole("dialog", { name: "Interaction details", exact: true });
  await expect(
    sourceDetail
      .getByRole("region", { name: "Source messages", exact: true })
      .getByText(summaries.email, { exact: true }),
  ).toBeVisible();
  await capture(page, "interaction-source-dark");
  await page.keyboard.press("Escape");
  await expect(sourceDetail).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  await page.getByRole("combobox", { name: "Record origin", exact: true }).click();
  await page.getByRole("option", { name: "Published from message", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Record origin", exact: true }).click();
  await page.getByRole("option", { name: "All origins", exact: true }).click();
  await expect(list.getByRole("listitem")).toHaveCount(50);
  await page.getByRole("button", { name: "Older interactions", exact: true }).click();
  await expect(page.getByRole("button", { name: "Newest", exact: true })).toBeEnabled();
  await page.getByRole("textbox", { name: "Search interactions", exact: true }).fill("Maya");
  await expect(list.getByRole("listitem")).toHaveCount(26);
  await expect(page.getByRole("button", { name: "Newest", exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Interaction type", exact: true }).click();
  await page.getByRole("option", { name: "Email", exact: true }).click();
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
  await capture(page, "dashboard-narrow-dark");
  await page.getByRole("link", { name: "Timeline", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Search interactions", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  await dialog.getByLabel("Ended at", { exact: true }).fill(`${localDay}T10:20`);
  await dialog
    .getByLabel("Summary", { exact: true })
    .fill("Agreed on a pilot with the operations team.");
  await capture(page, "new-interaction-dark");
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
  await page.getByRole("link", { name: "Timeline", exact: true }).click();
  await expect(
    page.getByRole("link", {
      name: "Open interaction: Agreed on a pilot with the operations team.",
      exact: true,
    }),
  ).toBeVisible();
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector('[role="status"][aria-label="Loading interaction directory…"]'))
        document.documentElement.setAttribute("data-loading-flash", "true");
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("stop-loading-check", () => observer.disconnect(), { once: true });
  });
  await page.getByRole("link", { name: "People", exact: true }).click();
  await expect(page.getByRole("table", { name: "People directory", exact: true })).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute("data-loading-flash", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("stop-loading-check")));
  await capture(page, "people-dark");
  await page.getByRole("link", { name: "Morgan Stone", exact: true }).click();
  await page.getByRole("tab", { name: "Relationship map", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Relationship map", exact: true })
      .getByRole("link", { name: "Northstar Labs", exact: true }),
  ).toBeVisible();
  await capture(page, "relationship-map-dark");
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
  await page.getByRole("radio", { name: "Explicit links", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No interactions in this period", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Related contacts", exact: true }).click();
  await page
    .getByRole("link", {
      name: "Open interaction: Agreed on a pilot with the operations team.",
      exact: true,
    })
    .click();
  const details = page.getByRole("dialog", { name: "Interaction details", exact: true });
  await expect(
    details.getByText("Agreed on a pilot with the operations team.", { exact: true }),
  ).toBeVisible();
  await expect(details.getByRole("heading", { name: "Linked records", exact: true })).toBeVisible();
  await capture(page, "interaction-details-dark");
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
  await capture(page, "dashboard-empty-dark");
  await page.getByRole("link", { name: "Timeline", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No interactions in this period", exact: true }),
  ).toBeVisible();
  await capture(page, "timeline-empty-dark");
  await page.getByRole("textbox", { name: "Search interactions", exact: true }).fill("unmatched");
  await expect(
    page.getByRole("heading", { name: "No matching interactions", exact: true }),
  ).toBeVisible();
});

test("people and organization tables paginate and reset after filtering", async ({
  account,
  client,
}) => {
  test.setTimeout(60_000);
  for (let i = 0; i < 26; i++) {
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
      occurredAt: new Date().toISOString(),
      summary: "Introduced the workspace.",
    });
  }
  const user = await client(account),
    { page } = user;
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/interactions", { section: "people", days: "all" });
  for (const type of ["people", "accounts"] as const) {
    if (type === "accounts")
      await page.getByRole("link", { name: "Organizations", exact: true }).click();
    await page.getByRole("combobox", { name: "Sort by", exact: true }).click();
    await page.getByRole("option", { name: "Name", exact: true }).click();
    const table = page.getByRole("table", {
      name: type === "people" ? "People directory" : "Organization directory",
      exact: true,
    });
    await expect(table.getByRole("row")).toHaveCount(26);
    await capture(
      page,
      type === "people" ? "people-paginated-dark" : "organizations-paginated-dark",
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(page.getByText("Page 2", { exact: true })).toBeVisible();
    await expect(
      table.getByRole("link", {
        name: type === "people" ? "Person 25" : "Company 25",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
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
    await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  }
});
