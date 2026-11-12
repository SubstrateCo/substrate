import { result } from "./test-support/api";
import { createCrm, readCrm } from "./test-support/crm";
import { test } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("CRM CSV attachments exclude private bodies and enforce export and tenant boundaries", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
  request: anonymous,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  const account = await createCrm(owner, {
    action: "createAccount",
    name: 'CSV customer, "North"\nLabs',
    summary: "PRIVATE ACCOUNT BODY",
  });
  const contact = await createCrm(owner, {
    action: "createContact",
    displayName: "=HYPERLINK(A1)",
    notes: "PRIVATE CONTACT NOTES",
  });
  const stages = await result<{ id: string }[]>(await readCrm(owner, "pipeline"));
  const deal = await createCrm(owner, {
    action: "createDeal",
    title: "CSV deal",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
    summary: "PRIVATE DEAL BODY",
  });
  const foreign = await createCrm(outsider, { action: "createAccount", name: "FOREIGN CUSTOMER" });
  for (const [kind, id] of [
    ["accounts", account.entityId],
    ["contacts", contact.entityId],
    ["deals", deal.entityId],
  ]) {
    const response = await owner.request.get("/api/v1/crm/export", {
      params: { organizationId: owner.organizationId, kind: kind! },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-disposition"]).toBe(
      `attachment; filename="crm-${kind}.csv"`,
    );
    expect(response.headers()["cache-control"]).toBe("no-store");
    const csv = await response.text();
    expect(csv).toContain(id!);
    expect(csv).not.toContain("PRIVATE");
    expect(csv).not.toContain(foreign.entityId);
    expect(csv).not.toContain("FOREIGN CUSTOMER");
    if (kind === "contacts") expect(csv).toContain('"\'=HYPERLINK(A1)"');
    if (kind === "deals") expect(csv).toContain(account.entityId);
  }
  for (const [client, organizationId, status] of [
    [anonymous, owner.organizationId, 401],
    [member.request, owner.organizationId, 403],
    [outsider.request, owner.organizationId, 403],
  ] as const) {
    const response = await client.get("/api/v1/crm/export", {
      params: { organizationId, kind: "accounts" },
    });
    expect(response.status()).toBe(status);
    expect(await response.text()).not.toContain(account.entityId);
  }
});

test("CRM exports apply the active search filter to accounts, contacts, and deals", async ({
  actors: { owner: sharedOwner },
  workspace,
}) => {
  const [owner] = await workspace(sharedOwner);
  const matchingAccount = await createCrm(owner, {
    action: "createAccount",
    name: "North export customer",
  });
  const hiddenAccount = await createCrm(owner, { action: "createAccount", name: "South customer" });
  const matchingContact = await createCrm(owner, {
    action: "createContact",
    displayName: "North export person",
  });
  const hiddenContact = await createCrm(owner, {
    action: "createContact",
    displayName: "South person",
  });
  const stages = await result<{ id: string }[]>(await readCrm(owner, "pipeline"));
  const matchingDeal = await createCrm(owner, {
    action: "createDeal",
    title: "North export deal",
    accountEntityId: matchingAccount.entityId,
    stageId: stages[0]!.id,
  });
  const hiddenDeal = await createCrm(owner, {
    action: "createDeal",
    title: "South deal",
    accountEntityId: hiddenAccount.entityId,
    stageId: stages[0]!.id,
  });
  for (const [kind, matching, hidden] of [
    ["accounts", matchingAccount, hiddenAccount],
    ["contacts", matchingContact, hiddenContact],
    ["deals", matchingDeal, hiddenDeal],
  ] as const) {
    const response = await owner.request.get("/api/v1/crm/export", {
      params: { organizationId: owner.organizationId, kind, search: " north export " },
    });
    expect(response.status()).toBe(200);
    const csv = await response.text();
    expect(csv).toContain(matching.entityId);
    expect(csv).not.toContain(hidden.entityId);
    expect(csv).not.toContain("South");
  }
});
