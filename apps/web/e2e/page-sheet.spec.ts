import { result } from "../../server/integration/test-support/api";
import { createCrm, readCrm } from "../../server/integration/test-support/crm";
import { captureCrm } from "./test-support/crm";
import { post, test, visit } from "./test-support/fixtures";
import { project } from "./test-support/tasks";
import { expect } from "@playwright/test";

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
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/contacts");
  const search = page.getByRole("textbox", { name: "Search contacts", exact: true });
  const before = await search.boundingBox();
  const launcher = page.getByRole("link", { name: "Avery Chen", exact: true });
  await launcher.click();
  const sheet = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(sheet.getByRole("heading", { name: "Avery Chen", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(sheet).toHaveCSS("animation-duration", "0.2s");
  expect(await search.boundingBox()).toEqual(before);
  await captureCrm(page, "page-sheet-contact-dark");
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
  await captureCrm(page, "page-sheet-contact-narrow-dark");
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
  await captureCrm(page, "page-sheet-deal-dark");
  await sheet.getByRole("link", { name: "Avery Chen", exact: true }).click();
  const contactSheet = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(
    contactSheet.getByRole("heading", { name: "Avery Chen", exact: true }),
  ).toBeVisible();
  await expect(sheet).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/crm");
  expect(new URL(page.url()).searchParams.get("recordId")).toBe(deal.entityId);
  await captureCrm(page, "page-sheet-contact-over-crm-dark");
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
  await captureCrm(page, "page-sheet-task-dark");
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
