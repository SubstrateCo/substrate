import { setupDatabase } from "../../testing/database";
import { crmStages } from "./schema";
import { crmSettings } from "./settings.schema";
import { expect, test } from "bun:test";

const f = setupDatabase();

async function openDeal() {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Customer" });
  const [stage] = await a.crm.ensurePipeline();
  const input = { title: "Sale", accountEntityId: account.entityId, stageId: stage!.id };
  return { a, input, stage: stage!, deal: await a.crm.createDeal(input) };
}

test("concurrent deal edits reject the stale version without overwriting the winner", async () => {
  const { a, input, deal } = await openDeal();
  const results = await Promise.allSettled(
    ["First", "Second"].map((title) =>
      a.crm.updateDeal(deal.entityId, deal.version, { ...input, title }),
    ),
  );
  const winners = results.flatMap((result) => (result.status === "fulfilled" ? [result] : []));
  const losers = results.flatMap((result) => (result.status === "rejected" ? [result] : []));
  expect(winners).toHaveLength(1);
  expect(losers).toHaveLength(1);
  expect(losers[0]!.reason).toMatchObject({
    name: "ConflictError",
    message: "The deal changed. Reload and try again.",
  });
  expect((await a.crm.getDeal(deal.entityId)).deal).toMatchObject({
    title: winners[0]!.value.title,
    version: deal.version + 1,
  });
  expect(
    (await a.crm.activity(deal.entityId)).items.filter((row) => row.action === "updated"),
  ).toHaveLength(1);
});

test("a concurrent deal edit, transition, and reassignment at one version apply exactly one", async () => {
  const { a, input, stage, deal } = await openDeal();
  const results = await Promise.allSettled([
    a.crm.updateDeal(deal.entityId, deal.version, { ...input, title: "Edited" }),
    a.crm.transitionDeal(deal.entityId, {
      expectedVersion: deal.version,
      requestId: crypto.randomUUID(),
      stageId: stage.id,
      outcome: "won",
      lostReason: null,
    }),
    a.crm.assignOwner(deal.entityId, {
      expectedOwnerActorEntityId: f.alice,
      ownerActorEntityId: f.bob,
      expectedVersion: deal.version,
      accessDecision: "keep_restricted",
    }),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([
    "fulfilled",
    "rejected",
    "rejected",
  ]);
  for (const result of results)
    if (result.status === "rejected")
      expect(result.reason).toMatchObject({ name: "ConflictError" });
  const current = (await a.crm.getDeal(deal.entityId)).deal;
  expect(current.version).toBe(deal.version + 1);
  // Exactly one of the three changes is visible.
  expect(
    [
      current.title === "Edited",
      current.outcome === "won",
      current.ownerActorEntityId === f.bob,
    ].filter(Boolean),
  ).toHaveLength(1);
  expect(
    (await a.crm.activity(deal.entityId)).items.filter((row) => row.action !== "created"),
  ).toHaveLength(1);
});

test("concurrent archive calls record one archive", async () => {
  const { a, deal } = await openDeal();
  await Promise.all([a.crm.archive(deal.entityId, true), a.crm.archive(deal.entityId, true)]);
  expect((await a.crm.getDeal(deal.entityId)).deal.archivedAt).not.toBeNull();
  expect(
    (await a.crm.activity(deal.entityId)).items.filter((row) => row.action === "archived"),
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

test("concurrent ensurePipeline calls create one default pipeline", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  const results = await Promise.all([
    a.crm.ensurePipeline(),
    b.crm.ensurePipeline(),
    a.crm.ensurePipeline(),
  ]);
  const stored = await f.db.select().from(crmStages);
  expect(stored.map((stage) => stage.name).sort()).toEqual([
    "Discovery",
    "Negotiation",
    "Proposal",
    "Qualification",
  ]);
  // Every caller gets the stages of the one pipeline.
  const ids = stored.map((stage) => stage.id).sort();
  for (const result of results) expect(result.map((stage) => stage.id).sort()).toEqual(ids);
});

test("concurrent stage configurations never interleave", async () => {
  const a = f.forActor(f.alice);
  const [first, second, third, fourth] = await a.crm.ensurePipeline();
  // Each call keeps a different pair, so an interleaved result would be visible.
  const requests = [
    [{ id: first!.id, name: "A one" }, { id: second!.id, name: "A two" }, { name: "A new" }],
    [{ id: fourth!.id, name: "B four" }, { id: third!.id, name: "B three" }, { name: "B new" }],
  ];
  const results = await Promise.allSettled(requests.map((stages) => a.crm.configureStages(stages)));
  const winners = results.flatMap((result, index) =>
    result.status === "fulfilled" ? [requests[index]!] : [],
  );
  expect(winners.length).toBeGreaterThanOrEqual(1);
  for (const result of results)
    if (result.status === "rejected")
      expect(result.reason).toMatchObject({ name: "ConflictError" });
  // The active pipeline is exactly what the last successful call asked for.
  const active = (await a.crm.pipeline()).filter((stage) => !stage.retired);
  const names = active.map((stage) => stage.name);
  expect(winners.map((stages) => stages.map((stage) => stage.name))).toContainEqual(names);
  expect(active.map((stage) => stage.position)).toEqual([0, 1, 2]);
});

test("a default currency change keeps the pipeline version", async () => {
  const a = f.forActor(f.alice);
  await a.crm.ensurePipeline();
  const before = await f.db.select().from(crmSettings);
  expect(before).toMatchObject([{ pipelineVersion: 1 }]);
  await a.crm.updateSettings({ defaultCurrency: "EUR" });
  expect(await f.db.select().from(crmSettings)).toEqual([
    { ...before[0]!, defaultCurrency: "EUR" },
  ]);
});
