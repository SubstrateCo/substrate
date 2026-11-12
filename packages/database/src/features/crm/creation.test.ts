import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";

const f = setupDatabase();
test("account and deal creation requests dedupe concurrent delivery and reject changed content", async () => {
  const a = f.forActor(f.alice);
  const input = { name: "Customer", requestId: crypto.randomUUID() };
  const [first, second] = await Promise.all([
    a.crm.createAccount(input),
    a.crm.createAccount(input),
  ]);
  expect(first.entityId).toBe(second.entityId);
  expect(await rejection(a.crm.createAccount({ ...input, name: "Changed" }))).toMatchObject({
    name: "ConflictError",
  });
  const stages = await a.crm.ensurePipeline();
  const dealInput = {
    title: "Sale",
    accountEntityId: first.entityId,
    stageId: stages[0]!.id,
    requestId: crypto.randomUUID(),
  };
  const [deal, replay] = await Promise.all([
    a.crm.createDeal(dealInput),
    a.crm.createDeal(dealInput),
  ]);
  expect(deal.entityId).toBe(replay.entityId);
  expect((await a.crm.getDeal(deal.entityId)).events).toHaveLength(1);
  expect(await a.crm.listDeals()).toHaveLength(1);
  await a.entities.softDelete(first.entityId);
  expect(await rejection(a.crm.createAccount(input))).toMatchObject({ name: "AccessDeniedError" });
  expect((await a.crm.createDeal(dealInput)).accountEntityId).toBeNull();
  expect(await a.crm.listAccounts()).toEqual([]);
});
