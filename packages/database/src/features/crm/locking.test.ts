import { crmAccounts, crmDeals } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { expect, test } from "bun:test";
import { sql } from "drizzle-orm";

const f = setupDatabase();

for (const operation of ["edit", "transition", "assignOwner"] as const) {
  test(`deal ${operation} permits foreign-key readers while its transaction is open`, async () => {
    const a = f.forActor(f.alice);
    const account = await a.crm.createAccount({ name: "Customer" });
    const [stage] = await a.crm.ensurePipeline();
    const input = { title: "Sale", accountEntityId: account.entityId, stageId: stage!.id };
    const deal = await a.crm.createDeal(input);
    await a.transaction(async (tx) => {
      if (operation === "edit")
        await tx.crm.updateDeal(deal.entityId, deal.version, { ...input, title: "Edited" });
      else if (operation === "transition")
        await tx.crm.transitionDeal(deal.entityId, {
          expectedVersion: deal.version,
          requestId: crypto.randomUUID(),
          stageId: stage!.id,
          outcome: "won",
          lostReason: null,
        });
      else
        await tx.crm.assignOwner(deal.entityId, {
          expectedOwnerActorEntityId: f.alice,
          ownerActorEntityId: f.bob,
          expectedVersion: deal.version,
          accessDecision: "keep_restricted",
        });
      await f.db.transaction(async (reader) => {
        const rows = await reader.execute(sql`
          SELECT entity_id FROM ${crmDeals} WHERE entity_id = ${deal.entityId}
          FOR KEY SHARE NOWAIT
        `);
        expect(rows).toHaveLength(1);
      });
    });
    expect((await a.crm.getDeal(deal.entityId)).deal.version).toBe(deal.version + 1);
  });
}

test("account reassignment permits foreign-key readers while its transaction is open", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Customer" });
  await a.transaction(async (tx) => {
    await tx.crm.assignOwner(account.entityId, {
      expectedOwnerActorEntityId: f.alice,
      ownerActorEntityId: f.bob,
      accessDecision: "keep_restricted",
    });
    await f.db.transaction(async (reader) => {
      const rows = await reader.execute(sql`
        SELECT entity_id FROM ${crmAccounts} WHERE entity_id = ${account.entityId}
        FOR KEY SHARE NOWAIT
      `);
      expect(rows).toHaveLength(1);
    });
  });
  expect((await a.crm.getAccount(account.entityId)).account.ownerActorEntityId).toBe(f.bob);
});

test("concurrent deal edits reject the stale version without overwriting the winner", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Customer" });
  const [stage] = await a.crm.ensurePipeline();
  const input = { title: "Sale", accountEntityId: account.entityId, stageId: stage!.id };
  const deal = await a.crm.createDeal(input);
  const results = await Promise.allSettled(
    ["First", "Second"].map((title) =>
      a.crm.updateDeal(deal.entityId, deal.version, { ...input, title }),
    ),
  );
  const winners = results.filter((result) => result.status === "fulfilled");
  const losers = results.filter((result) => result.status === "rejected");
  expect(winners).toHaveLength(1);
  expect(losers).toHaveLength(1);
  expect(losers[0]!.reason).toMatchObject({ name: "ConflictError" });
  expect((await a.crm.getDeal(deal.entityId)).deal).toMatchObject({
    title: winners[0]!.value.title,
    version: deal.version + 1,
  });
  expect(
    (await a.crm.activity(deal.entityId)).items.filter((row) => row.action === "updated"),
  ).toHaveLength(1);
});

test("concurrent reassignments reject a stale owner without recording a second change", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Customer" });
  const input = {
    expectedOwnerActorEntityId: f.alice,
    ownerActorEntityId: f.bob,
    accessDecision: "keep_restricted" as const,
  };
  const results = await Promise.allSettled([
    a.crm.assignOwner(account.entityId, input),
    a.crm.assignOwner(account.entityId, input),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toMatchObject([
    { reason: { name: "ConflictError" } },
  ]);
  expect((await a.crm.getAccount(account.entityId)).account.ownerActorEntityId).toBe(f.bob);
  expect(
    (await a.crm.activity(account.entityId)).items.filter((row) => row.action === "owner_changed"),
  ).toHaveLength(1);
});
