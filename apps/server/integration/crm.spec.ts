import { rejected, result } from "./test-support/api";
import { createCrm, readCrm, writeCrm } from "./test-support/crm";
import { test } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("CRM records enforce workspace, record access, and trusted mutation origins", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
  request: anonymous,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  const name = "Confidential acquisition account";
  const account = await createCrm(owner, { action: "createAccount", name });
  expect(
    (
      await writeCrm(owner, { action: "createAccount", name }, "https://untrusted.example.test")
    ).status(),
  ).toBe(403);
  expect(
    (
      await anonymous.get("/api/v1/crm/account", {
        params: { organizationId: owner.organizationId, entityId: account.entityId },
      })
    ).status(),
  ).toBe(401);
  for (const actor of [member, outsider]) {
    await rejected(await readCrm(actor, "account", { entityId: account.entityId }), [name]);
    expect(await result(await readCrm(actor, "accounts", { search: name }))).toEqual([]);
    await rejected(
      await writeCrm(actor, {
        action: "updateAccount",
        entityId: account.entityId,
        name: "Changed",
      }),
      [name],
    );
  }
  await rejected(
    await outsider.request.get("/api/v1/crm/account", {
      params: { organizationId: owner.organizationId, entityId: account.entityId },
    }),
    [name],
  );
  expect(
    await result(await readCrm(owner, "account", { entityId: account.entityId })),
  ).toMatchObject({
    account: { entityId: account.entityId, name },
  });
});

test("CRM rejects foreign customer links and stale deal transitions without changing the deal", async ({
  actors: { owner: sharedOwner, outsider },
  workspace,
}) => {
  const [owner] = await workspace(sharedOwner);
  const [account, contact, foreignAccount, stages] = await Promise.all([
    createCrm(owner, { action: "createAccount", name: "Northstar Labs" }),
    createCrm(owner, { action: "createContact", displayName: "Jordan Lee" }),
    createCrm(outsider, { action: "createAccount", name: "Private foreign customer" }),
    readCrm(owner, "pipeline").then(result<{ id: string; name: string }[]>),
  ]);
  expect(stages.length).toBeGreaterThanOrEqual(2);
  const dealInput = {
    action: "createDeal" as const,
    title: "Northstar rollout",
    accountEntityId: account.entityId,
    contactEntityIds: [contact.entityId],
    primaryContactEntityId: contact.entityId,
    stageId: stages[0]!.id,
    amount: "48000",
    currency: "USD",
  };
  await rejected(
    await writeCrm(owner, { ...dealInput, accountEntityId: foreignAccount.entityId }),
    ["Private foreign customer"],
  );
  const deal = await createCrm(owner, dealInput);
  const transition = {
    action: "transitionDeal" as const,
    entityId: deal.entityId,
    expectedVersion: 1,
    requestId: crypto.randomUUID(),
    stageId: stages[1]!.id,
    outcome: "open" as const,
  };
  await result(await writeCrm(owner, transition));
  expect((await writeCrm(owner, { ...transition, requestId: crypto.randomUUID() })).status()).toBe(
    409,
  );
  expect(await result(await readCrm(owner, "deal", { entityId: deal.entityId }))).toMatchObject({
    deal: { entityId: deal.entityId, version: 2, stageId: stages[1]!.id, outcome: "open" },
    account: { entityId: account.entityId },
    contacts: [{ contact: { entityId: contact.entityId }, isPrimary: true }],
  });
});

test("CRM currency defaults require organization management and do not rewrite existing deals", async ({
  actors: { owner: sharedOwner, member: sharedMember, outsider },
  workspace,
}) => {
  const [owner, member] = await workspace(sharedOwner, sharedMember);
  expect(await result(await readCrm(owner, "settings"))).toMatchObject({ defaultCurrency: null });
  const account = await createCrm(owner, {
    action: "createAccount",
    name: "Existing USD customer",
  });
  const stages = await result<{ id: string }[]>(await readCrm(owner, "pipeline"));
  const deal = await createCrm(owner, {
    action: "createDeal",
    title: "Existing USD contract",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
    amount: "12500",
    currency: "USD",
  });
  await result(await writeCrm(owner, { action: "updateSettings", defaultCurrency: "EUR" }));
  expect(
    (await writeCrm(member, { action: "updateSettings", defaultCurrency: "GBP" })).status(),
  ).toBe(404);
  const foreign = { ...outsider, organizationId: owner.organizationId };
  await rejected(await writeCrm(foreign, { action: "updateSettings", defaultCurrency: "GBP" }));
  await rejected(await readCrm(foreign, "settings"));
  expect(await result(await readCrm(member, "settings"))).toMatchObject({ defaultCurrency: "EUR" });
  expect(await result(await readCrm(owner, "deal", { entityId: deal.entityId }))).toMatchObject({
    deal: { currency: "USD", version: 1 },
  });
  expect(await result(await readCrm(outsider, "settings"))).toMatchObject({
    defaultCurrency: null,
  });
  expect(
    (await writeCrm(owner, { action: "updateSettings", defaultCurrency: "ZZZ" })).status(),
  ).toBe(400);
  expect(await result(await readCrm(owner, "settings"))).toMatchObject({ defaultCurrency: "EUR" });
  await result(await writeCrm(owner, { action: "updateSettings", defaultCurrency: null }));
  expect(await result(await readCrm(owner, "settings"))).toMatchObject({ defaultCurrency: null });
});

test("CRM account and deal creation retries return one record and reject changed request input", async ({
  actors: { owner: sharedOwner },
  workspace,
}) => {
  const [owner] = await workspace(sharedOwner);
  const accountInput = {
    action: "createAccount" as const,
    requestId: crypto.randomUUID(),
    name: "Retry-safe customer",
  };
  const account = await createCrm(owner, accountInput);
  expect((await createCrm(owner, accountInput)).entityId).toBe(account.entityId);
  expect((await writeCrm(owner, { ...accountInput, name: "Different customer" })).status()).toBe(
    409,
  );
  expect(await result(await readCrm(owner, "accounts"))).toMatchObject([
    { entityId: account.entityId },
  ]);

  const stages = await result<{ id: string }[]>(await readCrm(owner, "pipeline"));
  const dealInput = {
    action: "createDeal" as const,
    requestId: crypto.randomUUID(),
    title: "Retry-safe rollout",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
  };
  const deal = await createCrm(owner, dealInput);
  expect((await createCrm(owner, dealInput)).entityId).toBe(deal.entityId);
  expect((await writeCrm(owner, { ...dealInput, title: "Different rollout" })).status()).toBe(409);
  expect(await result(await readCrm(owner, "deals"))).toMatchObject([{ entityId: deal.entityId }]);
});
