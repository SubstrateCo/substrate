import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";

const f = setupDatabase();
test("currency defaults are unset, tenant scoped, admin managed, and do not rewrite deals", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  expect((await b.crm.settings()).defaultCurrency).toBeNull();
  expect(await rejection(b.crm.updateSettings({ defaultCurrency: "EUR" }))).toMatchObject({
    name: "AccessDeniedError",
  });
  expect(await rejection(a.crm.updateSettings({ defaultCurrency: "ZZZ" }))).toMatchObject({
    name: "ValidationError",
  });
  await a.crm.updateSettings({ defaultCurrency: "EUR" });
  expect((await b.crm.settings()).defaultCurrency).toBe("EUR");
  expect((await f.forActor(f.outsider, f.orgB).crm.settings()).defaultCurrency).toBeNull();
  const stages = await a.crm.ensurePipeline();
  const account = await a.crm.createAccount({ name: "Customer" });
  const deal = await a.crm.createDeal({
    title: "Sale",
    stageId: stages[0]!.id,
    accountEntityId: account.entityId,
    amount: "10",
    currency: "USD",
  });
  await a.crm.updateSettings({ defaultCurrency: "GBP" });
  expect((await a.crm.getDeal(deal.entityId)).deal.currency).toBe("USD");
  await a.crm.updateSettings({ defaultCurrency: null });
  expect((await a.crm.settings()).defaultCurrency).toBeNull();
});
