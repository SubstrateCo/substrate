import { result } from "../../server/integration/test-support/api";
import { createCrm, readCrm } from "../../server/integration/test-support/crm";
import { post, visit } from "./test-support/fixtures";
import { project } from "./test-support/tasks";
import { test } from "./test-support/workspace-fixtures";
import { expect } from "@playwright/test";

// Keep normal-motion coverage for sheet transitions and focus restoration.
test.use({ reducedMotion: "no-preference" });

test("contact sheets keep the list stable, replace records, and restore focus in dark mode", async ({
  account,
  client,
}) => {
  const first = await createCrm(account, {
    action: "createContact",
    displayName: "Avery Chen",
    notes: "Product lead at Northstar. Planning the winter launch.",
  });
  await createCrm(account, {
    action: "createContact",
    displayName: "Morgan Lee",
    notes: "Operations lead at Northstar.",
  });
  const user = await client(account);
  const { page } = user;
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    false,
  );
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/contacts");
  const search = page.getByRole("searchbox", { name: "Search contacts", exact: true });
  const before = await search.boundingBox();
  const launcher = page.getByRole("link", { name: "Avery Chen", exact: true });
  await launcher.click();
  const sheet = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(sheet.getByRole("heading", { name: "Avery Chen", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(sheet).toHaveCSS("animation-duration", "0.2s");
  expect(await search.boundingBox()).toEqual(before);
  const shell = await sheet.elementHandle();
  await page.getByRole("link", { name: "Morgan Lee", exact: true }).click();
  await expect(sheet.getByRole("heading", { name: "Morgan Lee", exact: true })).toBeVisible();
  expect(await sheet.evaluate((node, previous) => node === previous, shell)).toBe(true);
  await search.focus();
  await expect(sheet).toBeVisible();
  await expect(search).toBeFocused();
  await sheet.getByRole("button", { name: "Close contact", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(launcher).toBeFocused();
  expect(new URL(page.url()).searchParams.has("recordId")).toBe(false);
  await visit(user, undefined, "/contacts", { recordId: first.entityId });
  await expect(sheet).toBeVisible();
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  const bounds = await sheet.boundingBox();
  const workspaceBounds = await page.locator("[data-workspace-shell] > div").last().boundingBox();
  expect(bounds!.width).toBeCloseTo(workspaceBounds!.width, 0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(sheet).toHaveCSS("animation-name", "none");
});

test("deal contact links open over CRM and return to the same deal", async ({
  account,
  client,
}) => {
  const contact = await createCrm(account, { action: "createContact", displayName: "Avery Chen" });
  const customer = await createCrm(account, { action: "createAccount", name: "Northstar" });
  const stages = await result<{ id: string }[]>(await readCrm(account, "pipeline"));
  const deal = await createCrm(account, {
    action: "createDeal",
    title: "Northstar winter launch",
    accountEntityId: customer.entityId,
    contactEntityIds: [contact.entityId],
    primaryContactEntityId: contact.entityId,
    stageId: stages[0]!.id,
    summary: "Launch workspace for the Northstar product team.",
    amount: "24000",
    currency: "USD",
  });
  const user = await client(account);
  const { page } = user;
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/crm", { section: "deals", recordId: deal.entityId });
  const sheet = page.getByRole("dialog", { name: "Deal", exact: true });
  await expect(
    sheet.getByRole("heading", { name: "Northstar winter launch", exact: true }),
  ).toBeVisible();
  await sheet.getByRole("link", { name: "Avery Chen", exact: true }).click();
  const contactSheet = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(
    contactSheet.getByRole("heading", { name: "Avery Chen", exact: true }),
  ).toBeVisible();
  await expect(sheet).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/crm");
  expect(new URL(page.url()).searchParams.get("recordId")).toBe(deal.entityId);
  await contactSheet.getByRole("button", { name: "Close contact", exact: true }).click();
  await expect(
    sheet.getByRole("heading", { name: "Northstar winter launch", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await visit(user, undefined, "/interactions", {
    section: "person",
    profileId: contact.entityId,
    days: "all",
  });
  await page.getByRole("link", { name: "Open contact", exact: true }).click();
  await expect(
    contactSheet.getByRole("heading", { name: "Avery Chen", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/interactions");
  expect(new URL(page.url()).searchParams.get("profileId")).toBe(contact.entityId);
  await contactSheet.getByRole("button", { name: "Close contact", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open contact", exact: true })).toBeVisible();
});

test("interaction sheets open over contacts and deals and return to them", async ({
  account,
  client,
}) => {
  const contact = await createCrm(account, { action: "createContact", displayName: "Avery Chen" });
  const customer = await createCrm(account, { action: "createAccount", name: "Northstar" });
  const stages = await result<{ id: string }[]>(await readCrm(account, "pipeline"));
  const deal = await createCrm(account, {
    action: "createDeal",
    title: "Northstar winter launch",
    accountEntityId: customer.entityId,
    contactEntityIds: [contact.entityId],
    primaryContactEntityId: contact.entityId,
    stageId: stages[0]!.id,
  });
  for (const [kind, summary] of [
    ["call", "Called about the winter launch budget."],
    ["note", "Draft note to delete."],
  ] as const)
    await createCrm(account, {
      action: "createInteraction",
      contactEntityId: contact.entityId,
      kind,
      occurredAt: new Date().toISOString(),
      summary,
    });
  const user = await client(account);
  const { page } = user;
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/contacts", { recordId: contact.entityId });
  const contactSheet = page.getByRole("dialog", { name: "Contact", exact: true });
  const sheet = page.getByRole("dialog", { name: "Interaction", exact: true });
  const history = contactSheet.getByRole("region", { name: "Interaction history", exact: true });
  await history
    .getByRole("link", { name: "Open interaction: Called about the winter launch budget." })
    .click();
  await expect(
    sheet.getByRole("heading", { name: "Call with Avery Chen", exact: true }),
  ).toBeVisible();
  await expect(contactSheet).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("recordId")).toBe(contact.entityId);
  await page.reload();
  await expect(
    sheet.getByRole("heading", { name: "Call with Avery Chen", exact: true }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit interaction", exact: true });
  await editor.getByLabel("Summary", { exact: true }).fill("Agreed on the winter launch budget.");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    sheet.getByText("Agreed on the winter launch budget.", { exact: true }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Close interaction", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    contactSheet.getByRole("heading", { name: "Avery Chen", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has("interactionId")).toBe(false);

  await history.getByRole("link", { name: "Open interaction: Draft note to delete." }).click();
  await sheet.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete interaction", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Delete interaction?", exact: true });
  await confirm.getByRole("button", { name: "Delete interaction", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(history.getByText("Draft note to delete.", { exact: true })).toHaveCount(0);

  await visit(user, undefined, "/crm", { section: "deals", recordId: deal.entityId });
  const dealSheet = page.getByRole("dialog", { name: "Deal", exact: true });
  await dealSheet.getByRole("radio", { name: "Related contacts", exact: true }).click();
  await dealSheet
    .getByRole("link", { name: "Open interaction: Agreed on the winter launch budget." })
    .click();
  await expect(
    sheet.getByRole("heading", { name: "Call with Avery Chen", exact: true }),
  ).toBeVisible();
  await expect(dealSheet).toHaveCount(0);
  await sheet.getByRole("link", { name: "Avery Chen", exact: true }).click();
  await expect(
    contactSheet.getByRole("heading", { name: "Avery Chen", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.has("interactionId")).toBe(false);
  await contactSheet.getByRole("button", { name: "Close contact", exact: true }).click();
  await expect(
    dealSheet.getByRole("heading", { name: "Northstar winter launch", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("recordId")).toBe(deal.entityId);
});

test("task sheet protects edits and uses the shared dark-mode surface", async ({
  account,
  client,
}) => {
  const workspace = await project(account);
  const task = await post<{ id: string }>(account, "tasks/mutations", {
    action: "createTask",
    organizationId: account.organizationId,
    projectEntityId: workspace.entityId,
    title: "Prepare winter launch",
    description: "Review the launch checklist and confirm the rollout schedule.",
  });
  const user = await client(account);
  const { page } = user;
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/tasks", { projectId: workspace.entityId, taskId: task.id });
  const sheet = page.getByRole("dialog", { name: "Task", exact: true });
  await expect(
    sheet.getByRole("heading", { name: "Prepare winter launch", exact: true }),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Edit task", exact: true }).click();
  await sheet
    .getByRole("textbox", { name: "Task title", exact: true })
    .fill("Unsaved launch title");
  await sheet.getByRole("button", { name: "Close task", exact: true }).click();
  const guard = page.getByRole("dialog", { name: "Discard unsaved changes?", exact: true });
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(sheet.getByRole("textbox", { name: "Task title", exact: true })).toHaveValue(
    "Unsaved launch title",
  );
});
