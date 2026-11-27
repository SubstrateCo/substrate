import { result } from "../../../server/integration/test-support/api";
import { createCrm, readCrm } from "../../../server/integration/test-support/crm";
import { conversation, post, visit } from "../test-support/fixtures";
import { project } from "../test-support/tasks";
import { test } from "../test-support/workspace-fixtures";
import { expect, type Page } from "@playwright/test";

async function mouseHistory(page: Page, button: "back" | "forward") {
  const cdp = await page.context().newCDPSession(page);
  try {
    // Blank list content, outside the sheet. Moving first also makes the pointer target explicit.
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 400,
      y: 700,
      button: "none",
      buttons: 0,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: 400,
      y: 700,
      button,
      buttons: button === "back" ? 8 : 16,
      clickCount: 1,
    });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 400,
      y: 700,
      button,
      buttons: 0,
      clickCount: 1,
    });
  } finally {
    await cdp.detach();
  }
}

test("mouse Back and Forward traverse contact history without dismissal or losing the forward branch", async ({
  account,
  client,
}) => {
  for (const displayName of ["History first", "History second"])
    await createCrm(account, { action: "createContact", displayName });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/contacts");
  const sheet = page.getByRole("dialog", { name: "Contact", exact: true });
  for (const name of ["History first", "History second"]) {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(sheet.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  const length = await page.evaluate(() => history.length);
  await mouseHistory(page, "back");
  await expect(sheet.getByRole("heading", { name: "History first", exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(length);
  await mouseHistory(page, "forward");
  await expect(sheet.getByRole("heading", { name: "History second", exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(length);
  await sheet.getByRole("button", { name: "Close contact", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.goForward();
  await expect(sheet.getByRole("heading", { name: "History first", exact: true })).toBeVisible();
  await page.goForward();
  await expect(sheet.getByRole("heading", { name: "History second", exact: true })).toBeVisible();
});

for (const dismiss of ["close", "escape", "outside"] as const) {
  test(`${dismiss} returns through contact history without adding a closed-state entry`, async ({
    account,
    client,
  }) => {
    await createCrm(account, { action: "createContact", displayName: "Dismiss contact" });
    const user = await client(account);
    const { page } = user;
    await visit(user, undefined, "/messages");
    await visit(user, undefined, "/contacts");
    const base = page.url();
    await page.getByRole("link", { name: "Dismiss contact", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Contact", exact: true });
    await expect(sheet).toBeVisible();
    const length = await page.evaluate(() => history.length);
    if (dismiss === "close")
      await sheet.getByRole("button", { name: "Close contact", exact: true }).click();
    else if (dismiss === "escape") await page.keyboard.press("Escape");
    else await page.mouse.click(400, 700);
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(base);
    expect(await page.evaluate(() => history.length)).toBe(length);
    await page.goForward();
    await expect(sheet).toBeVisible();
    await page.goBack();
    await expect(sheet).toHaveCount(0);
    await page.goBack();
    await expect(page).toHaveURL(/\/messages(?:\?|$)/);
  });
}

test("a directly loaded contact closes in place instead of returning to another app", async ({
  account,
  client,
}) => {
  const contact = await createCrm(account, {
    action: "createContact",
    displayName: "Direct contact",
  });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/messages");
  await visit(user, undefined, "/contacts", { recordId: contact.entityId });
  const sheet = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(sheet).toBeVisible();
  const length = await page.evaluate(() => history.length);
  await sheet.getByRole("button", { name: "Close contact", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/contacts");
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goBack();
  await expect(page).toHaveURL(/\/messages(?:\?|$)/);
});

test("an unscoped app URL resolves its workspace before opening record history", async ({
  account,
  client,
}) => {
  await createCrm(account, { action: "createContact", displayName: "Scoped history" });
  const user = await client(account);
  const { page } = user;
  await page.goto("/contacts");
  await expect(page).toHaveURL(new RegExp(`workspaceId=${account.organizationId}`));
  await page.getByRole("link", { name: "Scoped history", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close contact", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.goForward();
  await expect(sheet.getByRole("heading", { name: "Scoped history", exact: true })).toBeVisible();
});

test("reloading a record loses opener proof and dismissal replaces only the current entry", async ({
  account,
  client,
}) => {
  await createCrm(account, { action: "createContact", displayName: "Reloaded contact" });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/contacts");
  await page.getByRole("link", { name: "Reloaded contact", exact: true }).click();
  await page.reload();
  const sheet = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(sheet).toBeVisible();
  const length = await page.evaluate(() => history.length);
  await sheet.getByRole("button", { name: "Close contact", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goBack();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Reloaded contact", exact: true })).toBeVisible();
});

test("two rapid Close events return once without skipping the originating list", async ({
  account,
  client,
}) => {
  await createCrm(account, { action: "createContact", displayName: "Double close" });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/messages");
  await visit(user, undefined, "/contacts");
  const base = page.url();
  await page.getByRole("link", { name: "Double close", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Close contact", exact: true }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await expect(sheet).toHaveCount(0);
  await expect(page).toHaveURL(base);
  await page.goForward();
  await expect(sheet).toBeVisible();
});

test("nested interactions return to their contact and remain reachable with Forward", async ({
  account,
  client,
}) => {
  const contact = await createCrm(account, {
    action: "createContact",
    displayName: "Nested contact",
  });
  await createCrm(account, {
    action: "createInteraction",
    contactEntityId: contact.entityId,
    kind: "call",
    occurredAt: new Date().toISOString(),
    summary: "History call",
  });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/contacts");
  await page.getByRole("link", { name: "Nested contact", exact: true }).click();
  const parent = page.url();
  await page.getByRole("link", { name: "Open interaction: History call", exact: true }).click();
  const interaction = page.getByRole("dialog", { name: "Interaction", exact: true });
  await expect(interaction).toBeVisible();
  await interaction.getByRole("button", { name: "Close interaction", exact: true }).click();
  await expect(page).toHaveURL(parent);
  await expect(page.getByRole("dialog", { name: "Contact", exact: true })).toBeVisible();
  await page.goForward();
  await expect(interaction).toBeVisible();
  await page.goBack();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("task history restores its tab and a cancelled dismissal keeps the draft and forward history", async ({
  account,
  client,
}) => {
  const created = await project(account);
  const task = await post<{ id: string }>(account, "tasks/mutations", {
    action: "createTask",
    organizationId: account.organizationId,
    projectEntityId: created.entityId,
    title: "History task",
  });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/tasks");
  await expect(page).toHaveURL(new RegExp(`projectId=${created.entityId}`));
  await page
    .getByRole("button", { name: /^Not started: History task/ })
    .getByText("History task", { exact: true })
    .click();
  const sheet = page.getByRole("dialog", { name: "Task", exact: true });
  await expect(sheet).toBeVisible();
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`taskId=${task.id}`));
  await expect(page.getByRole("tab", { name: "Tasks", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Edit task", exact: true }).click();
  await sheet.getByLabel("Task title", { exact: true }).fill("Unsaved history task");
  const selected = page.url();
  const length = await page.evaluate(() => history.length);
  await sheet.getByRole("button", { name: "Close task", exact: true }).click();
  await page.getByRole("button", { name: "Keep editing", exact: true }).click();
  await expect(page).toHaveURL(selected);
  await expect(sheet.getByLabel("Task title", { exact: true })).toHaveValue("Unsaved history task");
  await sheet.getByRole("button", { name: "Close task", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goForward();
  await expect(sheet.getByRole("heading", { name: "History task", exact: true })).toBeVisible();
});

test("closing a thread returns to the conversation without creating a history entry", async ({
  account,
  client,
}) => {
  const channel = await conversation(account);
  const root = await post<{ id: string }>(account, "messaging/messages", {
    conversationId: channel.id,
    body: "History root",
  });
  await post(account, "messaging/messages", {
    conversationId: channel.id,
    threadId: root.id,
    body: "History reply",
  });
  const user = await client(account);
  const { page } = user;
  await visit(user);
  await expect(page).toHaveURL(new RegExp(`conversationId=${channel.id}`));
  await page
    .getByRole("article")
    .filter({ has: page.getByText("History root", { exact: true }) })
    .getByRole("button", { name: /^1 reply/ })
    .click();
  const thread = page.getByRole("complementary", { name: "Thread", exact: true });
  await expect(thread).toBeVisible();
  const length = await page.evaluate(() => history.length);
  await thread.getByRole("button", { name: "Close thread", exact: true }).click();
  await expect(thread).toHaveCount(0);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goForward();
  await expect(thread.getByText("History reply", { exact: true })).toBeVisible();
});

test("the default CRM section is a stable background for deal history", async ({
  account,
  client,
}) => {
  const stages = await result<{ id: string }[]>(await readCrm(account, "pipeline"));
  const customer = await createCrm(account, { action: "createAccount", name: "History customer" });
  await createCrm(account, {
    action: "createDeal",
    title: "History deal",
    stageId: stages[0]!.id,
    accountEntityId: customer.entityId,
  });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/crm");
  await expect(page).toHaveURL(/section=deals/);
  await page.getByRole("link", { name: "History deal", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Deal", exact: true });
  await expect(sheet).toBeVisible();
  const length = await page.evaluate(() => history.length);
  await sheet.getByRole("button", { name: "Close deal", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => history.length)).toBe(length);
  await page.goForward();
  await expect(sheet.getByRole("heading", { name: "History deal", exact: true })).toBeVisible();
});
