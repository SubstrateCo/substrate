import { actors } from "../../core/actors/schema";
import { entities } from "../../core/entities/schema";
import { member } from "../../core/organizations/schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
test("CRM people are canonical active same-organization humans, never inferred or agent identities", async () => {
  const agent = await ownedAgent(f, "alice", "Private sales assistant");
  const people = await f.forActor(f.bob).crm.people();
  await f.verifyEmails();
  expect(await (await f.forSession("bob")).crm.people()).toEqual(people);
  expect(people).toEqual(
    [
      { entityId: f.alice, userId: "alice", type: "human" as const },
      { entityId: f.bob, userId: "bob", type: "human" as const },
    ].sort((a, b) => a.entityId.localeCompare(b.entityId)),
  );
  const outside = await f.forActor(f.outsider, f.orgB).crm.people();
  expect(outside).toEqual([{ entityId: f.outsider, userId: "outsider", type: "human" }]);
  for (const hidden of [agent.actorId, agent.agentId, "Private sales assistant", f.outsider])
    expect(JSON.stringify(people)).not.toContain(hidden);
  expect(await rejection(f.forActor(f.alice, f.orgB).crm.people())).toMatchObject({
    name: "AccessDeniedError",
  });
});

test("the people directory omits disabled, deleted and removed humans and denies an inactive caller", async () => {
  const a = f.forActor(f.alice);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
  expect((await a.crm.people()).map((row) => row.entityId)).toEqual([f.alice]);
  expect(await rejection(f.forActor(f.bob).crm.people())).toMatchObject({
    name: "AccessDeniedError",
  });
  await f.db.update(actors).set({ disabledAt: null }).where(eq(actors.entityId, f.bob));
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, f.bob));
  expect((await a.crm.people()).map((row) => row.entityId)).toEqual([f.alice]);
  await f.db.update(entities).set({ deletedAt: null }).where(eq(entities.entityId, f.bob));
  await f.db.delete(member).where(eq(member.id, "bob-a"));
  expect((await a.crm.people()).map((row) => row.entityId)).toEqual([f.alice]);
});

test("only a CRM root owner can list its explicit human grants", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  const account = await a.crm.createAccount({ name: "Business" });
  await a.crm.share(account.entityId, f.bob, "view");
  expect(await a.crm.grants(account.entityId)).toEqual(
    [
      { actorEntityId: f.alice, level: "owner" as const },
      { actorEntityId: f.bob, level: "view" as const },
    ].sort((x, y) => x.actorEntityId.localeCompare(y.actorEntityId)),
  );
  expect(await rejection(b.crm.grants(account.entityId))).toMatchObject({
    name: "AccessDeniedError",
  });
  await a.crm.share(account.entityId, f.bob, "edit");
  expect(await rejection(b.crm.grants(account.entityId))).toMatchObject({
    name: "AccessDeniedError",
  });
  expect(
    await rejection(f.forActor(f.outsider, f.orgB).crm.grants(account.entityId)),
  ).toMatchObject({ name: "AccessDeniedError" });
  const project = await a.projects.create({ name: "Not a CRM root" });
  expect(await rejection(a.crm.grants(project.entityId))).toMatchObject({
    name: "AccessDeniedError",
  });
  const contact = await a.contacts.createContact({ displayName: "Customer" });
  const interaction = await a.contactInteractions.createInteraction({
    contactEntityId: contact.entityId,
    kind: "call",
    summary: "Call",
    occurredAt: new Date(),
  });
  expect(await rejection(a.crm.grants(interaction.entityId))).toMatchObject({
    name: "AccessDeniedError",
  });
});

test("a view grant on a contact or deal gives read access until it is revoked", async () => {
  const a = f.forActor(f.alice);
  const b = f.forActor(f.bob);
  const contact = await a.contacts.createContact({ displayName: "Customer" });
  const account = await a.crm.createAccount({ name: "Business" });
  const stages = await a.crm.ensurePipeline();
  const deal = await a.crm.createDeal({
    title: "Sale",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
  });
  for (const [entityId, read] of [
    [contact.entityId, () => b.contacts.getContact(contact.entityId)],
    [deal.entityId, () => b.crm.getDeal(deal.entityId)],
  ] as const) {
    expect(await rejection(read())).toMatchObject({ name: "AccessDeniedError" });
    await a.crm.share(entityId, f.bob, "view");
    await read();
    expect(await rejection(b.crm.share(entityId, f.bob, "owner"))).toMatchObject({
      name: "AccessDeniedError",
    });
    await a.crm.revoke(entityId, f.bob);
    expect(await rejection(read())).toMatchObject({ name: "AccessDeniedError" });
  }
});

test("grant lists omit inactive members and do not fabricate implicit administrator grants", async () => {
  const a = f.forActor(f.alice);
  const account = await f.forActor(f.bob).crm.createAccount({ name: "Business" });
  expect(await a.crm.grants(account.entityId)).toEqual([{ actorEntityId: f.bob, level: "owner" }]);
  await f.db.update(actors).set({ disabledAt: new Date() }).where(eq(actors.entityId, f.bob));
  expect(await a.crm.grants(account.entityId)).toEqual([]);
  await f.db.update(actors).set({ disabledAt: null }).where(eq(actors.entityId, f.bob));
  await f.db.update(entities).set({ deletedAt: new Date() }).where(eq(entities.entityId, f.bob));
  expect(await a.crm.grants(account.entityId)).toEqual([]);
  await f.db.update(entities).set({ deletedAt: null }).where(eq(entities.entityId, f.bob));
  await f.db.delete(member).where(eq(member.id, "bob-a"));
  expect(await a.crm.grants(account.entityId)).toEqual([]);
});
