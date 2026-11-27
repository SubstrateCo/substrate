import type { ContactWrite } from "@substrate/contracts/contacts/input";
import type { InteractionWrite } from "@substrate/contracts/context/interactions";
import type { CrmWrite } from "@substrate/contracts/crm/input";
import type { ServiceResult } from "@substrate/contracts/result";

import { result } from "../../../server/integration/test-support/api";
import {
  createCrm,
  readCrm,
  recordMutationPath,
} from "../../../server/integration/test-support/crm";
import { selectCrmOption } from "../test-support/crm";
import { conversation, post, visit } from "../test-support/fixtures";
import { test } from "../test-support/workspace-fixtures";
import { expect, type Locator, type Page } from "@playwright/test";

async function submitCrm(
  page: Page,
  action: (CrmWrite | ContactWrite | InteractionWrite)["action"],
  button: Locator,
) {
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === recordMutationPath(action) &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action === action,
  );
  await button.click();
  const saved = await response;
  expect(saved.ok(), `${action} is saved by the real API`).toBe(true);
  const body: ServiceResult<{ entityId: string }> = await saved.json();
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}

test("create customer records, record a call, and advance a linked deal", async ({
  account,
  client,
}) => {
  test.setTimeout(45_000);
  const user = await client(account);
  const { page } = user;
  await page.emulateMedia({ colorScheme: "dark" });
  await visit(user, undefined, "/crm", { section: "accounts" });
  // The empty list offers the same action; use the page header's.
  await page.getByRole("button", { name: "New account", exact: true }).first().click();
  const accountDialog = page.getByRole("dialog", { name: "New account", exact: true });
  await accountDialog.getByLabel("Name", { exact: true }).fill("Northstar Labs");
  await accountDialog.getByLabel("Website", { exact: true }).fill("https://northstar.example");
  await accountDialog.getByLabel("Domain", { exact: true }).fill("northstar.example");
  await accountDialog
    .getByLabel("Summary", { exact: true })
    .fill("Customer workspace rollout for the operations team.");
  const customer = await submitCrm(
    page,
    "createAccount",
    accountDialog.getByRole("button", { name: "Create account", exact: true }),
  );
  await expect(page.getByRole("heading", { name: "Northstar Labs", exact: true })).toBeVisible();

  const contact = await createCrm(account, {
    action: "createContact",
    displayName: "Jordan Lee",
    notes: "Operations lead. Coordinates the rollout and customer training.",
  });
  await visit(user, undefined, "/contacts", { recordId: contact.entityId });
  await expect(page.getByRole("heading", { name: "Jordan Lee", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New interaction", exact: true }).click();
  const interactionDialog = page.getByRole("dialog", { name: "New interaction", exact: true });
  await interactionDialog.getByLabel("Occurred at", { exact: true }).fill("2026-11-10T10:30");
  const summary = "Confirmed a 40-seat pilot. Send the rollout plan before the next call.";
  await interactionDialog.getByLabel("Summary", { exact: true }).fill(summary);
  await submitCrm(
    page,
    "createInteraction",
    interactionDialog.getByRole("button", { name: "Create interaction", exact: true }),
  );
  await expect(page.getByText(summary, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(summary, { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await visit(user, undefined, "/crm", { section: "deals" });
  // The header and the empty board both offer "New deal".
  await page.getByRole("button", { name: "New deal", exact: true }).first().click();
  const dealDialog = page.getByRole("dialog", { name: "New deal", exact: true });
  await dealDialog.getByLabel("Title", { exact: true }).fill("Northstar workspace rollout");
  await selectCrmOption(page, "Account", "Northstar Labs");
  await selectCrmOption(page, "Primary contact", "Jordan Lee");
  await dealDialog.getByLabel("Amount", { exact: true }).fill("48000");
  await dealDialog.getByLabel("Currency", { exact: true }).fill("USD");
  await dealDialog.getByLabel("Expected close", { exact: true }).click();
  await page.getByLabel("Type a date", { exact: true }).fill("2026-12-15");
  await page.getByLabel("Type a date", { exact: true }).press("Enter");
  await expect(dealDialog.getByLabel("Expected close", { exact: true })).toHaveText("Dec 15");
  await dealDialog
    .getByLabel("Summary", { exact: true })
    .fill("Pilot, training, and rollout for the operations workspace.");
  const deal = await submitCrm(
    page,
    "createDeal",
    dealDialog.getByRole("button", { name: "Create deal", exact: true }),
  );
  await expect(
    page.getByRole("heading", { name: "Northstar workspace rollout", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move deal", exact: true }).click();
  await selectCrmOption(page, "Stage", "Discovery");
  const transition = page.getByRole("dialog", { name: "Move deal", exact: true });
  await submitCrm(
    page,
    "transitionDeal",
    transition.getByRole("button", { name: "Move deal", exact: true }),
  );
  await expect(transition).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Northstar workspace rollout", exact: true }),
  ).toBeVisible();
  const persisted = await result<{ deal: { amount: string } }>(
    await readCrm(account, "deal", { entityId: deal.entityId }),
  );
  expect(persisted).toMatchObject({
    deal: {
      entityId: deal.entityId,
      version: 2,
      outcome: "open",
      currency: "USD",
    },
    account: { entityId: customer.entityId, name: "Northstar Labs" },
    contacts: [{ contact: { entityId: contact.entityId }, isPrimary: true }],
  });
  expect(Number(persisted.deal.amount)).toBe(48000);
  await expect(page.getByRole("link", { name: "Jordan Lee", exact: true })).toHaveAttribute(
    "href",
    new RegExp(`/crm\\?.*recordId=${deal.entityId}.*contactId=${contact.entityId}`),
  );
  await page.getByRole("link", { name: "Jordan Lee", exact: true }).click();
  const contactSheet = page.getByRole("dialog", { name: "Contact", exact: true });
  await expect(
    contactSheet.getByRole("heading", { name: "Jordan Lee", exact: true }),
  ).toBeVisible();
  await contactSheet.getByRole("button", { name: "Close contact", exact: true }).click();
  await expect(contactSheet).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Northstar workspace rollout", exact: true }),
  ).toBeVisible();
  const activity = page
    .getByRole("dialog", { name: "Deal", exact: true })
    .getByRole("region", { name: "Activity", exact: true });
  for (const action of ["Created record", "Changed stage or outcome"]) {
    const event = activity.getByRole("listitem").filter({ hasText: action });
    await expect(event.getByText(account.name, { exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Close deal", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Discovery", exact: true })
      .getByRole("link", { name: /Northstar workspace rollout/ }),
  ).toBeVisible();

  await page
    .getByRole("region", { name: "Discovery", exact: true })
    .getByRole("link", { name: /Northstar workspace rollout/ })
    .click();
  const project = await post<{ id: string }>(account, "tasks/mutations", {
    action: "createProject",
    organizationId: account.organizationId,
    name: "Customer rollout",
  });
  await page.getByRole("button", { name: "New follow-up", exact: true }).click();
  const followUp = page.getByRole("dialog", { name: "New follow-up", exact: true });
  await followUp.getByLabel("Title", { exact: true }).fill("Send the rollout plan");
  await selectCrmOption(page, "Project", "Customer rollout");
  await followUp.getByRole("checkbox", { name: /I approve sharing/ }).check();
  await submitCrm(
    page,
    "createFollowUp",
    followUp.getByRole("button", { name: "Create follow-up", exact: true }),
  );
  const taskLink = page
    .getByRole("region", { name: "Follow-ups", exact: true })
    .getByRole("link", { name: /Send the rollout plan/ });
  await expect(taskLink).toHaveAttribute("href", new RegExp(`projectId=${project.id}`));
  await taskLink.click();
  await expect(
    page
      .getByRole("region", { name: "Task details", exact: true })
      .getByRole("heading", { name: "Send the rollout plan", exact: true }),
  ).toBeVisible();

  const channel = await conversation(account);
  const message = await post<{ id: string }>(account, "messaging/messages", {
    conversationId: channel.id,
    body: "Review the Northstar rollout before kickoff.",
  });
  await visit(user, channel.id);
  const article = page
    .getByRole("article")
    .filter({ hasText: "Review the Northstar rollout before kickoff." });
  await article.getByRole("button", { name: "More message actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Link work or CRM", exact: true }).click();
  const linkDialog = page.getByRole("dialog", { name: "Link existing records", exact: true });
  await linkDialog.getByRole("tab", { name: "Deals", exact: true }).click();
  await linkDialog
    .getByRole("combobox", { name: "Search work to link", exact: true })
    .fill("Northstar");
  await linkDialog.getByRole("option", { name: /Northstar workspace rollout/ }).click();
  await linkDialog.getByRole("button", { name: "Link item", exact: true }).click();
  await expect(linkDialog).toHaveCount(0);
  await visit(user, undefined, "/crm", { section: "deals", recordId: deal.entityId });
  const discussion = page
    .getByRole("region", { name: "Related discussions", exact: true })
    .locator(`a[href*="messageId=${message.id}"]`);
  await expect(discussion).toBeVisible();
  await discussion.click();
  await expect(
    page
      .getByRole("complementary", { name: "Thread", exact: true })
      .getByText("Review the Northstar rollout before kickoff.", { exact: true }),
  ).toBeVisible();
});

test("CRM default currency prefills new deal drafts and preserves an existing USD deal", async ({
  account,
  client,
}) => {
  const customer = await createCrm(account, { action: "createAccount", name: "Existing customer" });
  const stages = await result<{ id: string }[]>(await readCrm(account, "pipeline"));
  const existing = await createCrm(account, {
    action: "createDeal",
    title: "Existing USD deal",
    accountEntityId: customer.entityId,
    stageId: stages[0]!.id,
    amount: "12500",
    currency: "USD",
  });
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/crm", { section: "settings" });
  await expect(page.getByRole("combobox", { name: "Default currency", exact: true })).toContainText(
    "Not set",
  );
  await selectCrmOption(page, "Default currency", "EUR");
  await submitCrm(
    page,
    "updateSettings",
    page
      .getByRole("region", { name: "CRM defaults", exact: true })
      .getByRole("button", { name: "Save", exact: true }),
  );
  await expect(page.getByRole("combobox", { name: "Default currency", exact: true })).toContainText(
    "EUR",
  );
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Default currency", exact: true })).toContainText(
    "EUR",
  );
  await visit(user, undefined, "/crm", { section: "deals" });
  await page.getByRole("button", { name: "New deal", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "New deal", exact: true });
  await expect(draft.getByLabel("Currency", { exact: true })).toHaveValue("EUR");
  await draft.getByRole("button", { name: "Cancel", exact: true }).click();
  await visit(user, undefined, "/crm", { section: "deals", recordId: existing.entityId });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Edit deal", exact: true })
      .getByLabel("Currency", { exact: true }),
  ).toHaveValue("USD");
});
