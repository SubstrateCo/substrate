import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { describe, expect, test } from "bun:test";

const f = setupDatabase();
describe("connected CRM", () => {
  test("account and deal rollups reuse interactions and follow deal access", async () => {
    const a = f.forActor(f.alice);
    const account = await a.crm.createAccount({ name: "Customer" });
    const contact = await a.contacts.create({ displayName: "Buyer" });
    await a.crm.setAffiliation({
      contactEntityId: contact.entityId,
      accountEntityId: account.entityId,
      title: "Buyer",
      isPrimary: true,
    });
    const stages = await a.crm.ensurePipeline();
    const deal = await a.crm.createDeal({
      title: "Sale",
      accountEntityId: account.entityId,
      contactEntityIds: [contact.entityId],
      stageId: stages[0]!.id,
    });
    const interaction = await a.contactInteractions.createInteraction({
      contactEntityId: contact.entityId,
      kind: "call",
      occurredAt: new Date(),
      summary: "Call",
    });
    await a.links.create({ entityId: interaction.entityId, otherEntityId: deal.entityId });
    expect(await a.crm.timeline(deal.entityId)).toHaveLength(1);
    expect(await a.crm.timeline(deal.entityId, { mode: "linked" })).toHaveLength(1);
    expect(await a.crm.timeline(account.entityId, { mode: "linked" })).toEqual([]);
    const structuralOnly = await a.contactInteractions.createInteraction({
      contactEntityId: contact.entityId,
      kind: "note",
      occurredAt: new Date(),
      summary: "Structural only",
    });
    const advisor = await a.contacts.create({ displayName: "Advisor" });
    const linkedOnly = await a.contactInteractions.createInteraction({
      contactEntityId: advisor.entityId,
      kind: "note",
      occurredAt: new Date(),
      summary: "Linked only",
    });
    await a.links.create({ entityId: deal.entityId, otherEntityId: linkedOnly.entityId });
    expect((await a.crm.timeline(deal.entityId)).map((row) => row.entityId).sort()).toEqual(
      [interaction.entityId, structuralOnly.entityId, linkedOnly.entityId].sort(),
    );
    expect(
      (await a.crm.timeline(deal.entityId, { mode: "linked" })).map((row) => row.entityId).sort(),
    ).toEqual([interaction.entityId, linkedOnly.entityId].sort());
    // Members read every contact's interactions, so the deal grant alone gates the rollup.
    expect(await rejection(f.forActor(f.bob).crm.timeline(deal.entityId))).toMatchObject({
      name: "AccessDeniedError",
    });
    await a.permissions.grant({ entityId: deal.entityId, actorEntityId: f.bob, level: "view" });
    expect(
      (await f.forActor(f.bob).crm.timeline(deal.entityId)).map((row) => row.entityId).sort(),
    ).toEqual([interaction.entityId, structuralOnly.entityId, linkedOnly.entityId].sort());
  });
  test("keeps account access independent of its organization-wide contacts", async () => {
    const a = f.forActor(f.alice);
    const b = f.forActor(f.bob);
    const account = await a.crm.createAccount({ name: "Customer" });
    expect(await rejection(b.crm.getAccount(account.entityId))).toMatchObject({
      name: "AccessDeniedError",
    });
    const contact = await a.contacts.create({ displayName: "Buyer" });
    await a.crm.setAffiliation({
      contactEntityId: contact.entityId,
      accountEntityId: account.entityId,
      title: "Buyer",
      isPrimary: true,
    });
    expect((await a.crm.getAccount(account.entityId)).contacts).toHaveLength(1);
    await a.crm.share(account.entityId, f.bob, "view");
    expect((await b.crm.getAccount(account.entityId)).contacts).toMatchObject([
      { contact: { entityId: contact.entityId } },
    ]);
    expect(await rejection(b.crm.share(account.entityId, f.bob, "owner"))).toMatchObject({
      name: "AccessDeniedError",
    });
    await a.crm.revoke(account.entityId, f.bob);
    expect(await rejection(b.crm.getAccount(account.entityId))).toMatchObject({
      name: "AccessDeniedError",
    });
  });
  test("transitions once, rejects stale edits, and retains closure history after reopen", async () => {
    const a = f.forActor(f.alice);
    const account = await a.crm.createAccount({ name: "Customer" });
    const stages = await a.crm.ensurePipeline();
    const deal = await a.crm.createDeal({
      title: "Sale",
      accountEntityId: account.entityId,
      stageId: stages[0]!.id,
    });
    const input = {
      expectedVersion: 1,
      requestId: crypto.randomUUID(),
      stageId: stages[1]!.id,
      outcome: "won" as const,
      lostReason: null,
    };
    const won = await a.crm.transitionDeal(deal.entityId, input);
    expect(won.closedAt).not.toBeNull();
    expect((await a.crm.transitionDeal(deal.entityId, input)).version).toBe(2);
    const stageChanges = async () =>
      (await a.crm.activity(deal.entityId)).items.filter((item) => item.action === "stage_changed");
    expect(await stageChanges()).toHaveLength(1);
    expect(
      await rejection(
        a.crm.transitionDeal(deal.entityId, { ...input, requestId: crypto.randomUUID() }),
      ),
    ).toMatchObject({ name: "ConflictError" });
    const reopened = await a.crm.transitionDeal(deal.entityId, {
      ...input,
      expectedVersion: 2,
      requestId: crypto.randomUUID(),
      outcome: "open",
    });
    expect(reopened.closedAt).toBeNull();
    expect(await stageChanges()).toHaveLength(2);
  });
  test("deal lists filter by outcome before the page limit", async () => {
    const a = f.forActor(f.alice);
    const account = await a.crm.createAccount({ name: "Customer" });
    const stages = await a.crm.ensurePipeline();
    const create = (title: string) =>
      a.crm.createDeal({ title, accountEntityId: account.entityId, stageId: stages[0]!.id });
    const deals = [await create("One"), await create("Two"), await create("Three")];
    const closed = deals.toSorted((x, y) => x.entityId.localeCompare(y.entityId)).slice(0, 2);
    for (const deal of closed)
      await a.crm.transitionDeal(deal.entityId, {
        expectedVersion: deal.version,
        requestId: crypto.randomUUID(),
        stageId: stages[0]!.id,
        outcome: "won",
        lostReason: null,
      });
    // The first ID-ordered page of one deal is closed; the open filter still finds the open one.
    const open = await a.crm.listDeals({ outcome: "open", limit: 1 });
    expect(open.map((deal) => deal.title)).toEqual(
      deals.flatMap((deal) => (closed.includes(deal) ? [] : [deal.title])),
    );
  });
  test("rejects unrelated deals, invalid money, and cross-tenant relationships", async () => {
    const a = f.forActor(f.alice);
    const stages = await a.crm.ensurePipeline();
    expect(
      await rejection(a.crm.createDeal({ title: "Empty", stageId: stages[0]!.id })),
    ).toMatchObject({ name: "ValidationError" });
    const account = await a.crm.createAccount({ name: "Customer" });
    expect(
      await rejection(
        a.crm.createDeal({
          title: "Bad money",
          stageId: stages[0]!.id,
          accountEntityId: account.entityId,
          amount: "0",
        }),
      ),
    ).toMatchObject({ name: "ValidationError" });
    const foreign = await f
      .forActor(f.outsider, f.orgB)
      .contacts.create({ displayName: "Outside" });
    expect(
      await rejection(
        a.crm.createDeal({
          title: "Cross tenant",
          stageId: stages[0]!.id,
          contactEntityIds: [foreign.entityId],
        }),
      ),
    ).toMatchObject({ name: "AccessDeniedError" });
    expect(await a.crm.listDeals()).toEqual([]);
  });
  test("reports exact currency totals, unknown amounts and live closure cohorts", async () => {
    const a = f.forActor(f.alice);
    const account = await a.crm.createAccount({ name: "Customer" });
    const stages = await a.crm.ensurePipeline();
    for (const fields of [
      { amount: "0", currency: "USD" },
      { amount: "10.1250", currency: "USD" },
      { amount: "7", currency: "EUR" },
      {},
    ]) {
      const deal = await a.crm.createDeal({
        title: "Sale",
        accountEntityId: account.entityId,
        stageId: stages[0]!.id,
        ...fields,
      });
      await a.crm.transitionDeal(deal.entityId, {
        expectedVersion: 1,
        requestId: crypto.randomUUID(),
        stageId: deal.stageId,
        outcome: "won",
        lostReason: null,
      });
    }
    const report = await a.crm.report(new Date("2000-01-01Z"), new Date("2100-01-01Z"));
    expect(report.closed.find((row) => row.currency === "USD")?.knownAmount).toBe("10.1250");
    expect(report.closed.find((row) => row.currency === "EUR")?.knownAmount).toBe("7.0000");
    expect(report.closed.find((row) => row.currency === null)?.missingAmountCount).toBe(1);
    expect(report.winRate).toBe(1);
    expect(
      (await f.forActor(f.bob).crm.report(new Date("2000-01-01Z"), new Date("2100-01-01Z"))).closed,
    ).toEqual([]);
    expect(
      (await a.crm.report(new Date("1900-01-01Z"), new Date("1901-01-01Z"))).winRate,
    ).toBeNull();
  });
  test("archive preserves history and blocks new routine relationships until restored", async () => {
    const a = f.forActor(f.alice);
    const contact = await a.contacts.create({ displayName: "Customer" });
    const interaction = await a.contactInteractions.createInteraction({
      contactEntityId: contact.entityId,
      kind: "call",
      summary: "Called",
      occurredAt: new Date(),
    });
    await a.contacts.archive(contact.entityId, true);
    expect(await a.contacts.listContacts()).toEqual([]);
    expect((await a.contactInteractions.get(interaction.entityId)).summary).toBe("Called");
    expect(
      await rejection(
        a.contactInteractions.createInteraction({
          contactEntityId: contact.entityId,
          kind: "call",
          summary: "New",
          occurredAt: new Date(),
        }),
      ),
    ).toMatchObject({ name: "ValidationError" });
    await a.contacts.archive(contact.entityId, false);
    expect(await a.contacts.listContacts()).toHaveLength(1);
  });
});
