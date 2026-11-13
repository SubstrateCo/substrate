import { realtimeKeys } from "@substrate/contracts/realtime";

import { RepositoryContext } from "../../core/repository-context";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { listCrmActivity } from "./activity";
import { crmActivityEvents } from "./activity.schema";
import { expect, test } from "bun:test";

const f = setupDatabase();
const activity = (id: string) =>
  listCrmActivity(
    new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.alice }),
    id,
  );
test("account activity records real changes once and stores field names, not snapshots", async () => {
  const a = f.forActor(f.alice);
  const input = { name: "Business", requestId: crypto.randomUUID() };
  const account = await a.crm.createAccount(input);
  await a.crm.createAccount(input);
  await a.crm.updateAccount(account.entityId, { name: "Business" });
  expect((await activity(account.entityId)).items.map((row) => row.action)).toEqual(["created"]);
  await a.crm.updateAccount(account.entityId, {
    name: "Business",
    summary: "Confidential summary content",
  });
  await a.crm.archive(account.entityId, true);
  await a.crm.archive(account.entityId, true);
  await a.crm.archive(account.entityId, false);
  await a.crm.archive(account.entityId, false);
  await a.crm.share(account.entityId, f.bob, "view");
  await a.crm.share(account.entityId, f.bob, "view");
  await a.crm.revoke(account.entityId, f.bob);
  await a.crm.revoke(account.entityId, f.bob);
  const rows = (await activity(account.entityId)).items;
  for (const action of ["created", "updated", "archived", "restored", "shared", "unshared"])
    expect(rows.filter((row) => row.action === action)).toHaveLength(1);
  expect(rows.find((row) => row.action === "updated")?.changedFields).toEqual(["summary"]);
  expect(JSON.stringify(rows)).not.toContain("Confidential summary content");
});

test("deal activity omits same-state transitions and request replays", async () => {
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
    outcome: "open",
    lostReason: null,
  });
  expect((await activity(deal.entityId)).items.map((row) => row.action)).toEqual(["created"]);
  const move = {
    expectedVersion: 2,
    requestId: crypto.randomUUID(),
    stageId: stages[1]!.id,
    outcome: "open" as const,
    lostReason: null,
  };
  await a.crm.transitionDeal(deal.entityId, move);
  await a.crm.transitionDeal(deal.entityId, move);
  await a.crm.assignOwner(deal.entityId, {
    expectedOwnerActorEntityId: f.alice,
    ownerActorEntityId: f.bob,
    expectedVersion: 3,
    accessDecision: "keep_restricted",
  });
  await a.crm.assignOwner(deal.entityId, {
    expectedOwnerActorEntityId: f.bob,
    ownerActorEntityId: f.bob,
    expectedVersion: 4,
    accessDecision: "keep_restricted",
  });
  const rows = (await activity(deal.entityId)).items;
  expect(rows.filter((row) => row.action === "stage_changed")).toHaveLength(1);
  expect(rows.filter((row) => row.action === "owner_changed")).toHaveLength(1);
  expect(rows.filter((row) => row.action === "created")).toHaveLength(1);
});

test("a caller rollback removes CRM activity with the record", async () => {
  await rejection(
    f.forActor(f.alice).transaction(async (repos) => {
      await repos.crm.createAccount({ name: "Rolled back" });
      throw new Error("abort");
    }),
  );
  expect(await f.db.select().from(crmActivityEvents)).toEqual([]);
  expect(await f.forActor(f.alice).crm.listAccounts()).toEqual([]);
});

test("contact detail and interaction wrappers record changes without duplicate no-ops", async () => {
  const a = f.forActor(f.alice);
  const contact = await a.contacts.createContact({ displayName: "Customer" });
  const input = {
    organizationId: f.orgA,
    contactEntityId: contact.entityId,
    action: "addIdentifier" as const,
    type: "email" as const,
    value: "buyer@example.com",
  };
  const identifier = await a.contacts.mutateContactDetail(input);
  if (!("id" in identifier)) throw new Error("Expected an identifier result.");
  await a.contacts.mutateContactDetail({ ...input, action: "updateIdentifier", id: identifier.id });
  const interaction = await a.contactInteractions.createInteraction({
    contactEntityId: contact.entityId,
    kind: "call",
    summary: "Called customer",
    occurredAt: new Date(),
  });
  await a.contactInteractions.updateInteraction(interaction.entityId, {
    summary: "Corrected summary",
  });
  await a.contactInteractions.updateInteraction(interaction.entityId, {
    summary: "Corrected summary",
  });
  const rows = (await activity(contact.entityId)).items;
  expect(
    rows.filter((row) => row.action === "updated" && row.changedFields.includes("identifier")),
  ).toHaveLength(1);
  expect(rows.filter((row) => row.action === "interaction_created")).toHaveLength(1);
  expect(rows.filter((row) => row.action === "interaction_updated")).toHaveLength(1);
  await a.contactInteractions.deleteInteraction(interaction.entityId);
  expect(
    (await activity(contact.entityId)).items.filter((row) => row.action === "interaction_deleted"),
  ).toHaveLength(1);
  expect(JSON.stringify(await f.db.select().from(crmActivityEvents))).not.toContain(
    "buyer@example.com",
  );
});

test("publication and follow-up request retries append only one event, with independently hidden task context", async () => {
  const { repos, reply, project } = await contextConversation(f);
  const contact = await repos.contacts.createContact({ displayName: "Customer" });
  await repos.crm.share(contact.entityId, f.bob, "view");
  const alice = await f.forSession("alice");
  const input = {
    contactEntityId: contact.entityId,
    kind: "message" as const,
    summary: "Approved summary",
    occurredAt: new Date().toISOString(),
    messageId: reply.id,
    consentToContactAudience: true as const,
  };
  await alice.contactInteractions.publishInteraction(input);
  await alice.contactInteractions.publishInteraction(input);
  const followup = {
    entityId: contact.entityId,
    projectEntityId: project.entityId,
    requestId: crypto.randomUUID(),
    title: "Private task label",
    consentToTaskAudience: true as const,
  };
  await repos.crm.createFollowUp(followup);
  await repos.crm.createFollowUp(followup);
  const rows = (await activity(contact.entityId)).items;
  expect(rows.filter((row) => row.action === "interaction_created")).toHaveLength(1);
  expect(rows.filter((row) => row.action === "follow_up_created")).toHaveLength(1);
  const bob = await listCrmActivity(
    new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob }),
    contact.entityId,
  );
  expect(bob.items.filter((row) => row.action === "follow_up_created")).toEqual([]);
  expect(JSON.stringify(bob)).not.toContain("Private task label");
  expect(JSON.stringify(rows)).not.toContain(reply.id);
});

test("a non-admin can revoke their own grant without losing the committed activity", async () => {
  const b = f.forActor(f.bob);
  const account = await b.crm.createAccount({ name: "Business" });
  await b.crm.share(account.entityId, f.alice, "owner");
  await b.crm.revoke(account.entityId, f.bob);
  expect(await rejection(b.crm.getAccount(account.entityId))).toMatchObject({
    name: "AccessDeniedError",
  });
  const event = (await activity(account.entityId)).items.find((row) => row.action === "unshared");
  expect(event?.actor).toEqual({ type: "human", displayName: "Bob" });
});

test("contact profile, detail and interaction mutations publish data-less committed contact hints", async () => {
  const a = f.forActor(f.alice);
  const created = await a.transaction((repos) =>
    repos.contacts.createContact({ displayName: "Customer" }),
  );
  const contact = created.result;
  const expected = {
    audience: realtimeKeys.entity(f.orgA, contact.entityId),
    domain: "context",
  } as const;
  expect(created.hints).toContainEqual(expected);
  const profile = await a.transaction((repos) =>
    repos.contacts.updateContact(contact.entityId, { notes: "Private CRM note" }),
  );
  expect(profile.hints).toContainEqual(expected);
  const detail = await a.transaction((repos) =>
    repos.contacts.mutateContactDetail({
      organizationId: f.orgA,
      action: "addUrl",
      contactEntityId: contact.entityId,
      url: "https://private-customer.example.test",
    }),
  );
  expect(detail.hints).toContainEqual(expected);
  const interaction = await a.transaction((repos) =>
    repos.contactInteractions.createInteraction({
      contactEntityId: contact.entityId,
      summary: "Private call summary",
      kind: "call",
      occurredAt: new Date(),
    }),
  );
  expect(interaction.hints).toContainEqual(expected);
  const updated = await a.transaction((repos) =>
    repos.contactInteractions.updateInteraction(interaction.result.entityId, {
      summary: "Updated private call summary",
    }),
  );
  expect(updated.hints).toContainEqual(expected);
  const deleted = await a.transaction((repos) =>
    repos.contactInteractions.deleteInteraction(interaction.result.entityId),
  );
  expect(deleted.hints).toContainEqual(expected);
  const hints = JSON.stringify([
    created.hints,
    profile.hints,
    detail.hints,
    interaction.hints,
    updated.hints,
    deleted.hints,
  ]);
  for (const secret of [
    "Private CRM note",
    "private-customer.example.test",
    "Private call summary",
  ])
    expect(hints).not.toContain(secret);
});
