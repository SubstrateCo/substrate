import { realtimeKeys } from "@substrate/contracts/realtime";

import { AccessDeniedError } from "../../errors";
import { entityGrants, member } from "../../schema";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { messagingParticipants } from "../messaging/schema";
import { messageEntityReferences } from "./schema";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("CRM discussions require both endpoints and hide restricted backlink metadata", async () => {
  const { repos, chat, conversation, reply } = await contextConversation(f);
  const contact = await repos.contacts.create({ displayName: "Private customer" });
  const before = await f.db.select().from(entityGrants);
  await f.context().attach(reply.id, contact.entityId);
  expect(await f.context().messageLinks(reply.id)).toMatchObject([
    { entityId: contact.entityId, entityType: "contact", title: "Private customer" },
  ]);
  expect(await f.context().related(contact.entityId)).toMatchObject([{ messageId: reply.id }]);
  expect(await f.db.select().from(entityGrants)).toEqual(before);

  await repos.permissions.grant({
    entityId: contact.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  // Target access does not expose private message IDs, names, timestamps, or counts.
  expect(await f.context("bob").related(contact.entityId)).toEqual([]);
  await f.db.update(member).set({ role: "admin" }).where(eq(member.userId, "bob"));
  expect(await f.context("bob").related(contact.entityId)).toEqual([]);
  expect(await rejection(f.context("bob").messageLinks(reply.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "bob"));
  expect(await rejection(f.context("bob").attach(reply.id, contact.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  await chat.addMembers(conversation.id, ["bob@example.com"]);
  expect(await f.context("bob").related(contact.entityId)).toHaveLength(1);
  // Message access and target view still do not permit association writes.
  expect(await rejection(f.context("bob").attach(reply.id, contact.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  await repos.permissions.revoke({ entityId: contact.entityId, actorEntityId: f.bob });
  expect(await f.context("bob").messageLinks(reply.id)).toEqual([]);
  expect(await f.context("bob").search({ query: "Private", kind: "contact" })).toEqual([]);
  await f.db.delete(messagingParticipants).where(eq(messagingParticipants.actorEntityId, f.bob));
  expect(await rejection(f.context("bob").messageLinks(reply.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection(f.context("outsider", f.orgB).attach(reply.id, contact.entityId)),
  ).toBeInstanceOf(AccessDeniedError);
});

test("interaction associations use real inherited entities and unlink preserves source provenance", async () => {
  const { repos, conversation, reply } = await contextConversation(f);
  const contact = await repos.contacts.create({ displayName: "Customer" });
  const interaction = await repos.contactInteractions.createManual({
    contactEntityId: contact.entityId,
    kind: "call",
    occurredAt: new Date(),
    summary: "Approved call summary",
  });
  await f.context().attach(reply.id, interaction.entityId);
  await f.db.insert(messageEntityReferences).values({
    organizationId: f.orgA,
    conversationId: conversation.id,
    messageId: reply.id,
    entityId: interaction.entityId,
    entityType: "contact_interaction",
    purpose: "source",
    createdByActorEntityId: f.alice,
  });
  await f.context().detach(reply.id, interaction.entityId);
  expect(await f.context().messageLinks(reply.id)).toMatchObject([
    {
      entityType: "contact_interaction",
      title: "Approved call summary",
      purpose: "source",
      canRemove: false,
    },
  ]);
  await repos.entities.softDelete(interaction.entityId);
  expect(await f.context().messageLinks(reply.id)).toEqual([]);
  expect(await rejection(f.context().related(interaction.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("account and deal discussions stay explicit and hints never cross the endpoint boundary", async () => {
  const { repos, reply } = await contextConversation(f);
  const account = await repos.crm.createAccount({ name: "Customer business" });
  const stages = await repos.crm.ensurePipeline();
  const deal = await repos.crm.createDeal({
    title: "First pursuit",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
  });
  const otherDeal = await repos.crm.createDeal({
    title: "Other pursuit",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
  });
  const alice = await f.forSession("alice");
  const change = await alice.context.attach(reply.id, deal.entityId);
  const crmHints = change.hints.filter((hint) => hint.audience[0] === "entity");
  expect(crmHints).toEqual([
    { audience: realtimeKeys.entity(f.orgA, deal.entityId), domain: "context" },
  ]);
  const messageHints = change.hints.filter((hint) => hint.audience[0] === "conversation");
  expect(messageHints).toHaveLength(1);
  expect(messageHints[0]).not.toHaveProperty("entityId");
  expect(messageHints[0]).not.toHaveProperty("projectId");
  expect(await f.context().related(deal.entityId)).toHaveLength(1);
  expect(await f.context().related(account.entityId)).toEqual([]);
  expect(await f.context().related(otherDeal.entityId)).toEqual([]);
  await repos.crm.archive(deal.entityId, true);
  expect(await f.context().search({ query: "First", kind: "deal", editable: true })).toEqual([]);
  expect(await rejection(f.context().attach(reply.id, deal.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  // Archive keeps readable history, but prevents new associations.
  expect(await f.context().related(deal.entityId)).toHaveLength(1);
});
