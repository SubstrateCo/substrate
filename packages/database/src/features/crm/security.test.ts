import { entities } from "../../core/entities/schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { crmDealContacts } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("deal edits retain deleted participants and change primary contacts without false activity", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  const hidden = await a.contacts.createContact({ displayName: "Deleted buyer" });
  const visible = await a.contacts.createContact({ displayName: "Workspace buyer" });
  const [stage] = await a.crm.ensurePipeline();
  const input = {
    title: "Sale",
    stageId: stage!.id,
    contactEntityIds: [hidden.entityId, visible.entityId],
    primaryContactEntityId: hidden.entityId,
  };
  const deal = await a.crm.createDeal(input);
  await a.crm.share(deal.entityId, f.bob, "edit");
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, hidden.entityId));
  const edit = { title: "Edited", stageId: stage!.id, contactEntityIds: [visible.entityId] };
  await b.crm.updateDeal(deal.entityId, 1, edit);
  const participants = async () =>
    (
      await f.db
        .select({
          contactEntityId: crmDealContacts.contactEntityId,
          isPrimary: crmDealContacts.isPrimary,
        })
        .from(crmDealContacts)
        .where(eq(crmDealContacts.dealEntityId, deal.entityId))
    ).sort((left, right) => left.contactEntityId.localeCompare(right.contactEntityId));
  const expected = [
    { contactEntityId: hidden.entityId, isPrimary: true },
    { contactEntityId: visible.entityId, isPrimary: false },
  ].sort((left, right) => left.contactEntityId.localeCompare(right.contactEntityId));
  expect(await participants()).toEqual(expected);
  expect((await b.crm.activity(deal.entityId)).items[0]).toMatchObject({
    changedFields: ["title"],
  });
  await b.crm.updateDeal(deal.entityId, 2, { ...edit, primaryContactEntityId: visible.entityId });
  expect(await participants()).toEqual(
    expected.map((row) => ({
      ...row,
      isPrimary: row.contactEntityId === visible.entityId,
    })),
  );
  expect((await b.crm.activity(deal.entityId)).items[0]).toMatchObject({
    changedFields: ["contacts"],
  });
  expect((await b.crm.getDeal(deal.entityId)).contacts).toMatchObject([
    { contact: { entityId: visible.entityId }, isPrimary: true },
  ]);
});
test("an admin owner's agent may change CRM settings but not configure stages", async () => {
  const agent = await ownedAgent(f, "alice", "Pipeline assistant");
  const agentRepos = f.forActor(agent.actorId);
  const stages = await f.forActor(f.alice).crm.ensurePipeline();
  await agentRepos.crm.updateSettings({ defaultCurrency: "USD" });
  expect(
    await rejection(
      agentRepos.crm.configureStages(stages.map((stage) => ({ id: stage.id, name: "Renamed" }))),
    ),
  ).toMatchObject({ name: "AccessDeniedError" });
  expect(await f.forActor(f.alice).crm.pipeline()).toEqual(stages);
});

test("transition results and retries do not reveal an unreadable account", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  const account = await a.crm.createAccount({ name: "Restricted business" });
  const stages = await a.crm.ensurePipeline();
  const deal = await a.crm.createDeal({
    title: "Shared pursuit",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
  });
  await a.crm.share(deal.entityId, f.bob, "edit");
  const input = {
    expectedVersion: 1,
    stageId: stages[1]!.id,
    outcome: "open" as const,
    requestId: crypto.randomUUID(),
    lostReason: null,
  };
  expect((await b.crm.transitionDeal(deal.entityId, input)).accountEntityId).toBeNull();
  expect((await b.crm.transitionDeal(deal.entityId, input)).accountEntityId).toBeNull();
});

test("editing a permission-filtered deal preserves an unavailable account", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  const account = await a.crm.createAccount({ name: "Restricted business" });
  const contact = await a.contacts.create({ displayName: "Organization buyer" });
  const stages = await a.crm.ensurePipeline();
  const deal = await a.crm.createDeal({
    title: "Shared pursuit",
    accountEntityId: account.entityId,
    contactEntityIds: [contact.entityId],
    primaryContactEntityId: contact.entityId,
    stageId: stages[0]!.id,
  });
  await a.crm.share(deal.entityId, f.bob, "edit");
  const visible = await b.crm.getDeal(deal.entityId);
  expect(visible.deal.accountEntityId).toBeNull();
  // Every member reads every contact, so only the account is hidden.
  expect(visible.contacts).toMatchObject([
    { contact: { entityId: contact.entityId }, isPrimary: true },
  ]);
  const updated = await b.crm.updateDeal(deal.entityId, 1, {
    title: "Renamed",
    stageId: deal.stageId,
    accountEntityId: null,
    contactEntityIds: [contact.entityId],
    primaryContactEntityId: contact.entityId,
  });
  expect(updated.accountEntityId).toBeNull();
  const actual = await a.crm.getDeal(deal.entityId);
  expect(actual.deal.title).toBe("Renamed");
  expect(actual.account?.entityId).toBe(account.entityId);
  expect(actual.contacts).toMatchObject([
    { contact: { entityId: contact.entityId }, isPrimary: true },
  ]);
});

test("closed deal text remains editable after its current stage is retired", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Business" });
  const stages = await a.crm.ensurePipeline();
  const deal = await a.crm.createDeal({
    title: "Sale",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
  });
  await a.crm.transitionDeal(deal.entityId, {
    expectedVersion: 1,
    requestId: crypto.randomUUID(),
    stageId: deal.stageId,
    outcome: "won",
    lostReason: null,
  });
  await a.crm.configureStages(stages.slice(1).map((stage) => ({ id: stage.id, name: stage.name })));
  const updated = await a.crm.updateDeal(deal.entityId, 2, {
    title: "Corrected sale",
    summary: "Correction",
    accountEntityId: account.entityId,
    stageId: deal.stageId,
  });
  expect(updated.title).toBe("Corrected sale");
  expect(updated.stageId).toBe(deal.stageId);
});

test("shared deal history and interaction responses do not reveal private agent identity", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  const agent = await ownedAgent(f, "alice", "Private strategy assistant");
  const agentRepos = f.forActor(agent.actorId);
  const account = await a.crm.createAccount({ name: "Business" });
  const contact = await a.contacts.createContact({ displayName: "Customer" });
  const stages = await a.crm.ensurePipeline();
  const deal = await a.crm.createDeal({
    title: "Sale",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
  });
  await a.crm.share(deal.entityId, f.bob, "view");
  await agentRepos.crm.transitionDeal(deal.entityId, {
    expectedVersion: 1,
    requestId: crypto.randomUUID(),
    stageId: stages[1]!.id,
    outcome: "open",
    lostReason: null,
  });
  await agentRepos.contactInteractions.createInteraction({
    contactEntityId: contact.entityId,
    kind: "call",
    occurredAt: new Date(),
    summary: "Customer call",
  });
  const history = await b.crm.activity(deal.entityId);
  const interactions = await b.contactInteractions.listInteractions(contact.entityId);
  expect(history.items.map((item) => item.action)).toContain("stage_changed");
  expect(history.items.map((item) => item.actor)).toContainEqual({
    type: "agent",
    displayName: "Agent on behalf of Alice",
  });
  expect(interactions[0]!.actor).toEqual({
    type: "agent",
    displayName: "Agent on behalf of Alice",
  });
  const serialized = JSON.stringify({
    history,
    interactions,
    timeline: await b.crm.timeline(contact.entityId),
  });
  for (const secret of [agent.actorId, agent.agentId, "Private strategy assistant", "userAgentId"])
    expect(serialized).not.toContain(secret);
});
