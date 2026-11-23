import { result } from "../../server/integration/test-support/api";
import { createCrm, readCrm, writeCrm } from "../../server/integration/test-support/crm";
import { selectCrmOption } from "./test-support/crm";
import { conversation, post, test, visit, type Actor } from "./test-support/fixtures";
import { detail, project } from "./test-support/tasks";
import { expect, type Page } from "@playwright/test";

test.describe.configure({ timeout: 30_000 });

async function customerDeal(actor: Actor, contactEntityIds: string[] = []) {
  const customer = await createCrm(actor, { action: "createAccount", name: "Editing customer" });
  const stages = await result<{ id: string; name: string }[]>(await readCrm(actor, "pipeline"));
  const fields = {
    title: "Original pursuit",
    accountEntityId: customer.entityId,
    contactEntityIds,
    primaryContactEntityId: null,
    stageId: stages[0]!.id,
    summary: "Original summary",
    amount: "1000",
    currency: "USD",
  };
  const deal = await createCrm(actor, { action: "createDeal", ...fields });
  return { deal, customer, fields, stages };
}

function savedDeal(page: Page, action: string) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        (action.endsWith("Interaction")
          ? "/api/v1/context/interactions/mutations"
          : "/api/v1/crm/mutations") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action === action,
  );
}

test("an open edit keeps its original version after a live refresh and conflicts instead of overwriting", async ({
  account,
  client,
}) => {
  const { deal, fields } = await customerDeal(account);
  const user = await client(account);
  const { page } = user;
  await visit(user, undefined, "/crm", { section: "deals", recordId: deal.entityId });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit deal", exact: true });
  await editor.getByLabel("Summary", { exact: true }).fill("Unsaved local summary");
  await editor.getByLabel("Amount", { exact: true }).fill("1500");
  const refreshed = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/v1/crm/deal" && url.searchParams.get("entityId") === deal.entityId
    );
  });
  await result(
    await writeCrm(account, {
      action: "updateDeal",
      entityId: deal.entityId,
      expectedVersion: 1,
      ...fields,
      title: "Remote title",
      summary: "Remote summary",
      amount: "9000",
    }),
  );
  await refreshed;
  await expect(
    page.getByRole("heading", { name: "Remote title", exact: true, includeHidden: true }),
  ).toHaveText("Remote title");
  await expect(editor.getByLabel("Summary", { exact: true })).toHaveValue("Unsaved local summary");
  await expect(editor.getByLabel("Amount", { exact: true })).toHaveValue("1500");
  const rejected = savedDeal(page, "updateDeal");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  const conflict = await rejected;
  expect(conflict.request().postDataJSON()).toMatchObject({
    expectedVersion: 1,
    summary: "Unsaved local summary",
  });
  expect(conflict.status()).toBe(409);
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editor.getByLabel("Summary", { exact: true })).toHaveValue("Remote summary");
  await expect(editor.getByLabel("Title", { exact: true })).toHaveValue("Remote title");
  await expect(editor.getByLabel("Amount", { exact: true })).toHaveValue(/^9000(?:\.0+)?$/);
});

test("editing a title does not turn an unselected participant into the primary contact", async ({
  account,
  client,
}) => {
  const contact = await createCrm(account, {
    action: "createContact",
    displayName: "Participant without primary",
  });
  const { deal } = await customerDeal(account, [contact.entityId]);
  const user = await client(account);
  await visit(user, undefined, "/crm", { section: "deals", recordId: deal.entityId });
  await user.page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = user.page.getByRole("dialog", { name: "Edit deal", exact: true });
  await expect(
    editor.getByRole("combobox", { name: "Primary contact", exact: true }),
  ).toContainText("None");
  await editor.getByLabel("Title", { exact: true }).fill("Retitled pursuit");
  const saved = savedDeal(user.page, "updateDeal");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).status()).toBe(200);
  expect(await result(await readCrm(account, "deal", { entityId: deal.entityId }))).toMatchObject({
    deal: { title: "Retitled pursuit" },
    contacts: [{ contact: { entityId: contact.entityId }, isPrimary: false }],
  });
});

// Contacts are readable by every member, so only the account can be restricted.
test("an editor can update a deal with a restricted customer account without removing it", async ({
  actors,
  client,
}) => {
  const { deal, customer } = await customerDeal(actors.sender);
  const destination = await project(actors.sender);
  const workspace = await detail(actors.sender, destination.entityId);
  const member = workspace.actors.find((actor) => actor.name === actors.member.name);
  if (!member) throw new Error("Member fixture is missing.");
  await result(
    await writeCrm(actors.sender, {
      action: "share",
      entityId: deal.entityId,
      actorEntityId: member.entityId,
      level: "edit",
    }),
  );
  const user = await client(actors.member);
  await visit(user, undefined, "/crm", { section: "deals", recordId: deal.entityId });
  await user.page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = user.page.getByRole("dialog", { name: "Edit deal", exact: true });
  await expect(editor.getByRole("combobox", { name: "Account", exact: true })).toContainText(
    "None",
  );
  await editor.getByLabel("Title", { exact: true }).fill("Updated without private customer access");
  const saved = savedDeal(user.page, "updateDeal");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).status()).toBe(200);
  expect(
    await result(await readCrm(actors.sender, "deal", { entityId: deal.entityId })),
  ).toMatchObject({
    deal: { title: "Updated without private customer access" },
    account: { entityId: customer.entityId },
  });
});

test("moving an already lost deal preserves its saved lost reason", async ({ account, client }) => {
  const { deal, stages } = await customerDeal(account);
  await result(
    await writeCrm(account, {
      action: "transitionDeal",
      entityId: deal.entityId,
      expectedVersion: 1,
      requestId: crypto.randomUUID(),
      stageId: stages[0]!.id,
      outcome: "lost",
      lostReason: "Budget approval declined",
    }),
  );
  const user = await client(account);
  await visit(user, undefined, "/crm", { section: "deals", recordId: deal.entityId });
  await user.page.getByRole("button", { name: "More actions", exact: true }).click();
  await user.page.getByRole("menuitem", { name: "Move deal", exact: true }).click();
  const editor = user.page.getByRole("dialog", { name: "Move deal", exact: true });
  await expect(editor.getByLabel("Lost reason", { exact: true })).toHaveValue(
    "Budget approval declined",
  );
  await selectCrmOption(user.page, "Stage", stages[1]!.name);
  const saved = savedDeal(user.page, "transitionDeal");
  await editor.getByRole("button", { name: "Move deal", exact: true }).click();
  expect((await saved).status()).toBe(200);
  expect(await result(await readCrm(account, "deal", { entityId: deal.entityId }))).toMatchObject({
    deal: { stageId: stages[1]!.id, outcome: "lost", lostReason: "Budget approval declined" },
  });
});

test("any member can correct a published interaction, but only its author can delete it", async ({
  actors,
  client,
}) => {
  const account = actors.sender;
  const contact = await createCrm(account, {
    action: "createContact",
    displayName: "Publication correction",
  });
  const channel = await conversation(account);
  const message = await post<{ id: string }>(account, "messaging/messages", {
    conversationId: channel.id,
    body: "The pilot includes twenty seats.",
  });
  await createCrm(account, {
    action: "publishInteraction",
    contactEntityId: contact.entityId,
    messageId: message.id,
    kind: "message",
    occurredAt: "2026-11-12T12:00:00Z",
    summary: "Incorrect: two hundred seats",
    consentToContactAudience: true,
  });
  const user = await client(actors.member);
  await visit(user, undefined, "/contacts", { recordId: contact.entityId });
  const history = user.page.getByRole("region", { name: "Interaction history", exact: true });
  await expect(
    user.page.getByText("The pilot includes twenty seats.", { exact: true }),
  ).toHaveCount(0);
  const row = history.getByRole("listitem").filter({ hasText: "Incorrect: two hundred seats" });
  await row.hover();
  await row.getByRole("button", { name: "Edit interaction", exact: true }).click();
  const editor = user.page.getByRole("dialog", { name: "Edit interaction", exact: true });
  await editor.getByLabel("Summary", { exact: true }).fill("Corrected: twenty seats");
  const saved = savedDeal(user.page, "updateInteraction");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await user.page.reload();
  await expect(
    user.page.getByText("The pilot includes twenty seats.", { exact: true }),
  ).toHaveCount(0);
  const corrected = history.getByRole("listitem").filter({ hasText: "Corrected: twenty seats" });
  await expect(corrected).toBeVisible();
  await corrected.hover();
  await expect(
    corrected.getByRole("button", { name: "Delete interaction", exact: true }),
  ).toHaveCount(0);

  const owner = await client(account);
  await visit(owner, undefined, "/contacts", { recordId: contact.entityId });
  const ownerHistory = owner.page.getByRole("region", { name: "Interaction history", exact: true });
  const ownerRow = ownerHistory
    .getByRole("listitem")
    .filter({ hasText: "Corrected: twenty seats" });
  await ownerRow.hover();
  await ownerRow.getByRole("button", { name: "Delete interaction", exact: true }).click();
  const confirm = owner.page.getByRole("dialog", { name: "Delete interaction?", exact: true });
  const removed = savedDeal(owner.page, "deleteInteraction");
  await confirm.getByRole("button", { name: "Delete interaction", exact: true }).click();
  expect((await removed).status()).toBe(200);
  await expect(ownerHistory.getByText("Corrected: twenty seats", { exact: true })).toHaveCount(0);
  await expect(ownerHistory.getByText("No interactions recorded", { exact: true })).toBeVisible();
});
