import { setupDatabase } from "../../testing/database";
import { expect, test } from "bun:test";

const f = setupDatabase();

test("home deals include only owned readable open deals closing within seven days", async () => {
  const alice = f.forActor(f.alice);
  const account = await alice.crm.createAccount({ name: "Northstar" });
  const stages = await alice.crm.ensurePipeline();
  const makeDeal = (title: string, expectedCloseDate: string | null) =>
    alice.crm.createDeal({
      title,
      accountEntityId: account.entityId,
      stageId: stages[0]!.id,
      expectedCloseDate,
    });
  const overdue = await makeDeal("Overdue", "2026-11-19");
  const soon = await makeDeal("Soon", "2026-11-28");
  await makeDeal("Later", "2026-11-29");
  await makeDeal("Unscheduled", null);
  const archived = await makeDeal("Archived", "2026-11-20");
  await alice.crm.archive(archived.entityId, true);
  const won = await makeDeal("Won", "2026-11-21");
  await alice.crm.transitionDeal(won.entityId, {
    expectedVersion: 1,
    requestId: crypto.randomUUID(),
    stageId: stages[0]!.id,
    outcome: "won",
    lostReason: null,
  });
  expect((await alice.crm.home("2026-11-21")).map((deal) => deal.entityId)).toEqual([
    overdue.entityId,
    soon.entityId,
  ]);
  await alice.crm.share(soon.entityId, f.bob, "view");
  expect(await f.forActor(f.bob).crm.home("2026-11-21")).toEqual([]);
  expect(await f.forActor(f.outsider, f.orgB).crm.home("2026-11-21")).toEqual([]);
});
