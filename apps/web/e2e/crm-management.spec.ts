import { result } from "../../server/integration/test-support/api";
import { createCrm, readCrm } from "../../server/integration/test-support/crm";
import { test, visit, type Actor } from "./test-support/fixtures";
import { expect, type Page } from "@playwright/test";

test.describe.configure({ timeout: 45_000 });

async function managedRecord(actor: Actor, kind: "accounts" | "contacts" | "deals") {
  const name = `Managed ${kind} ${crypto.randomUUID()}`;
  if (kind === "accounts")
    return { ...(await createCrm(actor, { action: "createAccount", name })), name };
  if (kind === "contacts")
    return { ...(await createCrm(actor, { action: "createContact", displayName: name })), name };
  const account = await createCrm(actor, { action: "createAccount", name: "Private customer" });
  const stages = await result<{ id: string }[]>(await readCrm(actor, "pipeline"));
  return {
    ...(await createCrm(actor, {
      action: "createDeal",
      title: name,
      accountEntityId: account.entityId,
      stageId: stages[0]!.id,
    })),
    name,
  };
}

function managementWrite(page: Page, action: "share" | "revoke" | "assignOwner") {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/crm/mutations" &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action === action,
  );
}

async function choosePerson(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Person", exact: true }).fill(name);
  await page.getByRole("option").filter({ hasText: name }).click();
}

// Accounts, contacts and deals share one management view, and database tests cover each kind's
// grant rules. Contacts use their own route; the creator test below covers the CRM route.
test("an owner shares and revokes a private contact through its detail", async ({
  actors,
  client,
}) => {
  const record = await managedRecord(actors.sender, "contacts");
  const owner = await client(actors.sender);
  const search = { recordId: record.entityId };
  await visit(owner, undefined, "/contacts", search);
  await owner.page.getByRole("button", { name: "Share", exact: true }).click();
  const sharing = owner.page.getByRole("dialog", { name: `Share ${record.name}`, exact: true });
  await choosePerson(owner.page, actors.member.name);
  const shared = managementWrite(owner.page, "share");
  await sharing.getByRole("button", { name: "Set access", exact: true }).click();
  expect((await shared).status()).toBe(200);
  await expect(sharing).toHaveCount(0);

  const reader = await client(actors.member);
  await visit(reader, undefined, "/contacts", search);
  await expect(reader.page.getByRole("heading", { name: record.name, exact: true })).toBeVisible();
  await expect(reader.page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
  await expect(reader.page.getByRole("button", { name: "Change owner", exact: true })).toHaveCount(
    0,
  );

  await owner.page.getByRole("button", { name: "Share", exact: true }).click();
  const grants = sharing.getByRole("list", { name: "Direct access", exact: true });
  const member = grants.getByRole("listitem").filter({ hasText: actors.member.name });
  await expect(member).toContainText("Can view");
  await member.hover();
  await member
    .getByRole("button", { name: `Remove ${actors.member.name}’s access`, exact: true })
    .click();
  const confirm = owner.page.getByRole("dialog", {
    name: `Remove ${actors.member.name}’s direct access?`,
    exact: true,
  });
  const revoked = managementWrite(owner.page, "revoke");
  await confirm.getByRole("button", { name: "Remove access", exact: true }).click();
  expect((await revoked).status()).toBe(200);
  await expect(confirm).toHaveCount(0);
  await reader.page.reload();
  await expect(
    reader.page.getByRole("heading", { name: "Record unavailable", exact: true }),
  ).toBeVisible();
  await expect(reader.page.getByRole("heading", { name: record.name, exact: true })).toHaveCount(0);
});

// Accounts use the same reassignment dialog; only deals also send their expected version.
test("deal reassignment requires existing access by default and never silently grants it", async ({
  actors,
  client,
}) => {
  const record = await managedRecord(actors.sender, "deals");
  const owner = await client(actors.sender);
  await visit(owner, undefined, "/crm", { section: "deals", recordId: record.entityId });
  await owner.page.getByRole("button", { name: "Change owner", exact: true }).click();
  const editor = owner.page.getByRole("dialog", { name: `Reassign ${record.name}`, exact: true });
  await choosePerson(owner.page, actors.member.name);
  await expect(
    editor.getByRole("radio", { name: "Do not reassign without existing access", exact: true }),
  ).toBeChecked();
  const rejected = managementWrite(owner.page, "assignOwner");
  await editor.getByRole("button", { name: "Reassign responsibility", exact: true }).click();
  const failure = await rejected;
  expect(failure.status()).toBe(400);
  expect(failure.request().postDataJSON()).toMatchObject({
    accessDecision: "require_existing_access",
    expectedVersion: 1,
  });
  await expect(editor).toBeVisible();
  await editor
    .getByRole("radio", { name: "Reassign and keep access restricted", exact: true })
    .click();
  await expect(editor).toContainText("No access will be granted.");
  const saved = managementWrite(owner.page, "assignOwner");
  await editor.getByRole("button", { name: "Reassign responsibility", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await expect(editor).toHaveCount(0);
  await expect(owner.page.getByRole("complementary", { name: "Record details" })).toContainText(
    actors.member.name,
  );

  const reader = await client(actors.member);
  const search = new URLSearchParams({
    workspaceId: actors.member.organizationId,
    section: "deals",
    recordId: record.entityId,
  });
  await reader.page.goto(`/crm?${search}`);
  await expect(
    reader.page.getByRole("heading", { name: "Record unavailable", exact: true }),
  ).toBeVisible();
  await expect(reader.page.getByText(record.name, { exact: true })).toHaveCount(0);
  await expect(reader.page.getByRole("complementary", { name: "Record details" })).toHaveCount(0);
  for (const name of ["Share", "Change owner", "Edit", "Archive"])
    await expect(reader.page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(reader.page.getByRole("dialog")).toHaveCount(0);
});

test("a creator who removes their own access closes management and sees only the unavailable state", async ({
  actors,
  client,
}) => {
  const record = await managedRecord(actors.member, "accounts");
  const user = await client(actors.member);
  await visit(user, undefined, "/crm", { section: "accounts", recordId: record.entityId });
  await user.page.getByRole("button", { name: "Share", exact: true }).click();
  await choosePerson(user.page, actors.sender.name);
  await user.page.getByRole("combobox", { name: "Access", exact: true }).click();
  await user.page.getByRole("option", { name: "Can manage access", exact: true }).click();
  const shared = managementWrite(user.page, "share");
  await user.page.getByRole("button", { name: "Set access", exact: true }).click();
  expect((await shared).status()).toBe(200);
  await user.page.getByRole("button", { name: "Share", exact: true }).click();
  const ownGrant = user.page
    .getByRole("list", { name: "Direct access", exact: true })
    .getByRole("listitem")
    .filter({ hasText: actors.member.name });
  await ownGrant.hover();
  await ownGrant
    .getByRole("button", { name: `Remove ${actors.member.name}’s access`, exact: true })
    .click();
  const revoked = managementWrite(user.page, "revoke");
  await user.page.getByRole("button", { name: "Remove access", exact: true }).click();
  expect((await revoked).status()).toBe(200);
  await expect(user.page.getByRole("dialog")).toHaveCount(0);
  await expect(
    user.page.getByRole("heading", { name: "Record unavailable", exact: true }),
  ).toBeVisible();
  await expect(user.page.getByRole("heading", { name: record.name, exact: true })).toHaveCount(0);
});
