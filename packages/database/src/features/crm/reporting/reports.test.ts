import { setupDatabase } from "../../../testing/database";
import { expect, test } from "bun:test";

const f = setupDatabase();
test("a customer's touch refreshes only the deal it explicitly references", async () => {
  const a = f.forActor(f.alice);
  const contact = await a.contacts.createContact({ displayName: "Shared buyer" });
  const stages = await a.crm.ensurePipeline();
  const fields = { contactEntityIds: [contact.entityId], stageId: stages[0]!.id };
  const dealA = await a.crm.createDeal({ ...fields, title: "Pursuit A" });
  const dealB = await a.crm.createDeal({ ...fields, title: "Pursuit B" });
  const asOf = new Date(Date.now() + 40 * 86400000).toISOString();
  const recent = new Date(+new Date(asOf) - 86400000);
  const linked = await a.contactInteractions.createInteraction({
    contactEntityId: contact.entityId,
    kind: "call",
    occurredAt: recent,
    summary: "Call about pursuit A",
  });
  await a.links.create({ entityId: dealA.entityId, otherEntityId: linked.entityId });
  const options = { asOf, staleDays: 30 };
  const report = () => a.crm.report(new Date("2000-01-01Z"), new Date("2100-01-01Z"), options);
  expect((await report()).exceptions.stale).toBe(1);
  const stale = await a.crm.reportDeals({ ...options, cohort: "stale" });
  expect(stale.items.map((row) => row.entityId)).toEqual([dealB.entityId]);
  expect(stale.items[0]!.lastMeaningfulInteractionAt).toBeNull();

  await a.contactInteractions.createInteraction({
    contactEntityId: contact.entityId,
    kind: "meeting",
    occurredAt: new Date(+recent + 3600000),
    summary: "General customer meeting with no selected deal",
  });
  expect((await report()).exceptions.stale).toBe(1);
  expect(
    (await a.crm.reportDeals({ ...options, cohort: "stale" })).items.map((row) => row.entityId),
  ).toEqual([dealB.entityId]);
  const open = await a.crm.reportDeals({ ...options, cohort: "open" });
  expect(
    open.items.find((row) => row.entityId === dealA.entityId)?.lastMeaningfulInteractionAt,
  ).toBe(recent.toISOString());
  expect(
    open.items.find((row) => row.entityId === dealB.entityId)?.lastMeaningfulInteractionAt,
  ).toBeNull();
  expect(await a.crm.timeline(contact.entityId)).toHaveLength(2);
});

test("follow-up exceptions use readable tasks and meaningful touches with matching cursor drilldowns", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  const account = await a.crm.createAccount({ name: "Business" });
  const project = await a.projects.create({ name: "Private follow-ups" });
  const contact = await a.contacts.create({ displayName: "Buyer" });
  const stages = await a.crm.ensurePipeline();
  const asOf = new Date(Date.now() + 40 * 86400000).toISOString();
  const yesterday = new Date(+new Date(asOf) - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(+new Date(asOf) + 86400000).toISOString().slice(0, 10);
  const deals = [];
  for (let i = 0; i < 3; i++) {
    const deal = await a.crm.createDeal({
      title: `Sale ${i}`,
      accountEntityId: account.entityId,
      stageId: stages[0]!.id,
    });
    deals.push(deal);
    await a.crm.share(deal.entityId, f.bob, "view");
    await a.crm.createFollowUp({
      entityId: deal.entityId,
      requestId: crypto.randomUUID(),
      projectEntityId: project.entityId,
      title: "Follow up",
      dueDate: [yesterday, null, tomorrow][i],
      consentToTaskAudience: true,
    });
  }
  const interaction = await a.contactInteractions.createInteraction({
    contactEntityId: contact.entityId,
    kind: "call",
    occurredAt: new Date(+new Date(asOf) - 86400000),
    summary: "Customer call",
  });
  await a.links.create({ entityId: interaction.entityId, otherEntityId: deals[0]!.entityId });
  const note = await a.contactInteractions.createInteraction({
    contactEntityId: contact.entityId,
    kind: "note",
    occurredAt: new Date(+new Date(asOf) - 86400000),
    summary: "Internal planning",
  });
  await a.links.create({ entityId: note.entityId, otherEntityId: deals[1]!.entityId });
  const input = { asOf, staleDays: 30 };
  const report = await a.crm.report(new Date("2000-01-01Z"), new Date("2100-01-01Z"), input);
  expect(report.exceptions).toMatchObject({ overdue: 1, noNextAction: 1, stale: 2 });
  const bob = await b.crm.report(new Date("2000-01-01Z"), new Date("2100-01-01Z"), input);
  expect(bob.exceptions).toMatchObject({ overdue: 0, noNextAction: 3, stale: 2 });
  const pages = [];
  let afterEntityId: string | undefined;
  do {
    const page = await b.crm.reportDeals({
      ...input,
      cohort: "no_next_action",
      limit: 1,
      afterEntityId,
    });
    expect(page.totalCount).toBe(3);
    pages.push(...page.items);
    afterEntityId = page.nextAfterEntityId ?? undefined;
  } while (afterEntityId);
  expect(new Set(pages.map((row) => row.entityId)).size).toBe(3);
  expect(pages.every((row) => row.nextActionDueDate === null)).toBe(true);
  expect((await a.crm.reportDeals({ ...input, cohort: "stale" })).totalCount).toBe(
    report.exceptions.stale,
  );
});

test("closed-currency cohort drilldowns match report totals without truncating later pages", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Business" });
  const stages = await a.crm.ensurePipeline();
  for (let i = 0; i < 3; i++) {
    const deal = await a.crm.createDeal({
      title: `Sale ${i}`,
      accountEntityId: account.entityId,
      stageId: stages[0]!.id,
      amount: "0",
      currency: "USD",
    });
    await a.crm.transitionDeal(deal.entityId, {
      expectedVersion: 1,
      requestId: crypto.randomUUID(),
      stageId: deal.stageId,
      outcome: "won",
      lostReason: null,
    });
  }
  const input = {
    from: "2000-01-01T00:00:00Z",
    to: "2100-01-01T00:00:00Z",
    currency: "USD",
    outcome: "won" as const,
  };
  const aggregate = await a.crm.report(new Date(input.from), new Date(input.to), input);
  const first = await a.crm.reportDeals({ ...input, cohort: "closed", limit: 2 });
  expect(first.totalCount).toBe(aggregate.won);
  expect(first.items).toHaveLength(2);
  const second = await a.crm.reportDeals({
    ...input,
    cohort: "closed",
    limit: 2,
    afterEntityId: first.nextAfterEntityId!,
  });
  expect(second.items).toHaveLength(1);
  expect(second.nextAfterEntityId).toBeNull();
  expect(new Set([...first.items, ...second.items].map((row) => row.entityId)).size).toBe(3);
  expect(
    (await a.crm.reportDeals({ ...input, currency: "EUR", cohort: "closed" })).totalCount,
  ).toBe(0);
});
