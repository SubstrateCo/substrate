import { commit } from "../../core/effects";
import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError, ConflictError } from "../../errors";
import { entities, entityGrants, contacts, member } from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { messageEntityReferences } from "../context/schema";
import { messagingParticipants } from "../messaging/schema";
import { crmActivityEvents } from "./activity.schema";
import { createCrmFromMessage, createCrmFromMessageInContext } from "./from-message";
import { crmCreateRequests } from "./requests.schema";
import { crmAccounts } from "./schema";
import { expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();
const identity = () => ({ userId: "alice", organizationId: f.orgA });
function input(messageId: string) {
  return {
    organizationId: f.orgA,
    messageId,
    requestId: crypto.randomUUID(),
    consentToRecordAudience: true as const,
    kind: "account" as const,
    fields: { name: "Reviewed company" },
  };
}

test("concurrent replay creates one independent root, source, request, and activity without copying the message", async () => {
  const { reply, root } = await contextConversation(f);
  const request = input(reply.id);
  const [a, b] = await Promise.all([
    createCrmFromMessage(f.db, identity(), request),
    createCrmFromMessage(f.db, identity(), request),
  ]);
  expect(a.result).toEqual(b.result);
  expect(Object.keys(a.result).sort()).toEqual(["entityId", "entityType"]);
  const [account] = await f.db.select().from(crmAccounts);
  expect(account).toMatchObject({
    entityId: a.result.entityId,
    name: "Reviewed company",
    summary: "",
  });
  const [entity] = await f.db
    .select()
    .from(entities)
    .where(eq(entities.entityId, a.result.entityId));
  expect(entity?.accessEntityId).toBe(a.result.entityId);
  expect(await f.db.select().from(messageEntityReferences)).toMatchObject([
    {
      messageId: reply.id,
      entityId: a.result.entityId,
      entityType: "account",
      purpose: "source",
      createdByActorEntityId: f.alice,
    },
  ]);
  expect(await f.db.select().from(crmCreateRequests)).toHaveLength(1);
  expect(await f.db.select().from(crmActivityEvents)).toHaveLength(1);
  expect(await f.db.select().from(crmAccounts)).toHaveLength(1);
  expect(await f.accessLevel(f.alice, a.result.entityId)).toBe("owner");
  expect(await rejection(f.forActor(f.bob).crm.getAccount(a.result.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection(
      createCrmFromMessage(f.db, identity(), { ...request, fields: { name: "Changed" } }),
    ),
  ).toBeInstanceOf(ConflictError);
  expect(
    await rejection(
      createCrmFromMessage(f.db, identity(), {
        ...request,
        kind: "contact",
        fields: { displayName: "Buyer" },
      }),
    ),
  ).toBeInstanceOf(ConflictError);
  expect(
    await rejection(createCrmFromMessage(f.db, identity(), { ...request, messageId: root.id })),
  ).toBeInstanceOf(ConflictError);
  expect(
    await rejection(createCrmFromMessage(f.db, identity(), { ...request, associate: true })),
  ).toBeInstanceOf(ConflictError);
});

test("optional association can be removed without removing provenance; CRM readers cannot see the source", async () => {
  const { reply, repos } = await contextConversation(f);
  const created = await createCrmFromMessage(f.db, identity(), {
    ...input(reply.id),
    associate: true,
    fields: { name: "Company", summary: "Approved fact" },
  });
  await f.context().detach(reply.id, created.result.entityId);
  expect(await f.context().messageLinks(reply.id)).toMatchObject([{ purpose: "source" }]);
  await repos.permissions.grant({
    entityId: created.result.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect((await f.forActor(f.bob).crm.getAccount(created.result.entityId)).account.summary).toBe(
    "Approved fact",
  );
  expect(await f.context("bob").related(created.result.entityId)).toEqual([]);
  expect(await rejection(f.context("bob").messageLinks(reply.id))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("source must be readable in its host tenant, including for admins and cross-tenant guests", async () => {
  const { reply, chat, conversation } = await contextConversation(f);
  await f.db.update(member).set({ role: "admin" }).where(eq(member.id, "bob-a"));
  await chat.addMembers(conversation.id, ["outside@example.com"]);
  for (const scope of [
    { userId: "bob", organizationId: f.orgA },
    { userId: "outsider", organizationId: f.orgB },
  ]) {
    expect(
      await rejection(
        createCrmFromMessage(f.db, scope, {
          ...input(reply.id),
          organizationId: scope.organizationId,
        }),
      ),
    ).toBeInstanceOf(AccessDeniedError);
  }
  expect(
    await rejection(
      createCrmFromMessage(f.db, identity(), { ...input(reply.id), organizationId: f.orgB }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(crmAccounts)).toEqual([]);
  expect(await f.db.select().from(crmCreateRequests)).toEqual([]);
});

test("replay preserves current record edits and does not recreate removed source references", async () => {
  const { reply, repos } = await contextConversation(f);
  const request = input(reply.id);
  const created = await createCrmFromMessage(f.db, identity(), request);
  await repos.crm.updateAccount(created.result.entityId, {
    name: "Later edit",
    summary: "Retained",
  });
  await f.db
    .delete(messageEntityReferences)
    .where(eq(messageEntityReferences.entityId, created.result.entityId));
  expect((await createCrmFromMessage(f.db, identity(), request)).result).toEqual(created.result);
  expect((await repos.crm.getAccount(created.result.entityId)).account).toMatchObject({
    name: "Later edit",
    summary: "Retained",
  });
  expect(await f.db.select().from(messageEntityReferences)).toEqual([]);
  expect(await f.db.select().from(crmAccounts)).toHaveLength(1);
});

test("replay after source deletion or revoked membership never recreates provenance or records", async () => {
  const { reply, root, conversation, chat } = await contextConversation(f);
  const deleted = input(reply.id);
  await createCrmFromMessage(f.db, identity(), deleted);
  await chat.deleteMessage(reply.id);
  expect(await rejection(createCrmFromMessage(f.db, identity(), deleted))).toBeInstanceOf(
    AccessDeniedError,
  );
  const revoked = input(root.id);
  await createCrmFromMessage(f.db, identity(), revoked);
  await f.db
    .update(messagingParticipants)
    .set({ leftAt: new Date() })
    .where(
      and(
        eq(messagingParticipants.conversationId, conversation.id),
        eq(messagingParticipants.actorEntityId, f.alice),
      ),
    );
  expect(await rejection(createCrmFromMessage(f.db, identity(), revoked))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await f.db.select().from(crmAccounts)).toHaveLength(2);
  expect(await f.db.select().from(messageEntityReferences)).toHaveLength(2);
});

test("caller rollback removes root, grants, source, activity, and retry identity", async () => {
  const { reply } = await contextConversation(f);
  const beforeEntities = await f.db.select().from(entities);
  const beforeGrants = await f.db.select().from(entityGrants);
  expect(
    await rejection(
      commit(f.db, async (tx) => {
        const { context } = await workspaceContext(tx, identity());
        await createCrmFromMessageInContext(context, identity(), input(reply.id));
        throw new Error("abort after source creation");
      }),
    ),
  ).toMatchObject({ message: "abort after source creation" });
  expect(await f.db.select().from(entities)).toEqual(beforeEntities);
  expect(await f.db.select().from(entityGrants)).toEqual(beforeGrants);
  expect(await f.db.select().from(messageEntityReferences)).toEqual([]);
  expect(await f.db.select().from(crmActivityEvents)).toEqual([]);
  expect(await f.db.select().from(crmCreateRequests)).toEqual([]);
});

test("contact creation uses the canonical CRM wrapper and deal creation retains real participants", async () => {
  const { reply, repos } = await contextConversation(f);
  const contact = await createCrmFromMessage(f.db, identity(), {
    ...input(reply.id),
    kind: "contact",
    fields: { displayName: "Buyer" },
  });
  expect(await f.db.select().from(contacts)).toMatchObject([
    { entityId: contact.result.entityId, displayName: "Buyer" },
  ]);
  expect((await repos.contacts.getContact(contact.result.entityId)).profile.entityId).toBe(
    contact.result.entityId,
  );
  const stages = await repos.crm.ensurePipeline();
  const deal = await createCrmFromMessage(f.db, identity(), {
    ...input(reply.id),
    kind: "deal",
    fields: { title: "Sale", stageId: stages[0]!.id, contactEntityIds: [contact.result.entityId] },
  });
  expect((await repos.crm.getDeal(deal.result.entityId)).deal.title).toBe("Sale");
  expect(await f.db.select().from(messageEntityReferences)).toHaveLength(2);
});

test("invalid deal relationships roll back without leaving a root or source", async () => {
  const { reply, repos } = await contextConversation(f);
  const stages = await repos.crm.ensurePipeline();
  const foreignContact = await f
    .forActor(f.outsider, f.orgB)
    .contacts.createContact({ displayName: "Foreign buyer" });
  const before = await f.db.select().from(entities);
  expect(
    await rejection(
      createCrmFromMessage(f.db, identity(), {
        ...input(reply.id),
        kind: "deal",
        fields: {
          title: "Invalid",
          stageId: stages[0]!.id,
          contactEntityIds: [foreignContact.entityId],
        },
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(entities)).toEqual(before);
  expect(await f.db.select().from(messageEntityReferences)).toEqual([]);
  expect(await f.db.select().from(crmCreateRequests)).toEqual([]);
});

test("task-discussion sources require independent task access and retain the reviewed record after revocation", async () => {
  await f.verifyEmails();
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Private project" });
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Evidence" });
  const conversationId = await repos.tasks.ensureDiscussion(task.entityId);
  const message = await f.messaging("alice").sendMessage(conversationId, "Private evidence");
  const bob = { userId: "bob", organizationId: f.orgA };
  const request = input(message.id);
  expect(await rejection(createCrmFromMessage(f.db, bob, request))).toBeInstanceOf(
    AccessDeniedError,
  );
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const created = await createCrmFromMessage(f.db, bob, request);
  await repos.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await rejection(createCrmFromMessage(f.db, bob, request))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect((await f.forActor(f.bob).crm.getAccount(created.result.entityId)).account.name).toBe(
    "Reviewed company",
  );
  expect(await f.context("bob").related(created.result.entityId)).toEqual([]);
});

test("trusted agent context is retained in source, activity, and request attribution", async () => {
  const { reply } = await contextConversation(f);
  const agent = await ownedAgent(f);
  const created = await createCrmFromMessage(
    f.db,
    { ...identity(), actorEntityId: agent.actorId },
    input(reply.id),
  );
  expect(await f.db.select().from(messageEntityReferences)).toMatchObject([
    { entityId: created.result.entityId, createdByActorEntityId: agent.actorId, purpose: "source" },
  ]);
  expect(await f.db.select().from(crmActivityEvents)).toMatchObject([
    { entityId: created.result.entityId, actorEntityId: agent.actorId, action: "created" },
  ]);
  expect(await f.db.select().from(crmCreateRequests)).toMatchObject([
    { entityId: created.result.entityId, actorEntityId: agent.actorId },
  ]);
  expect(
    await rejection(
      commit(f.db, async (tx) => {
        const { context } = await workspaceContext(tx, {
          ...identity(),
          actorEntityId: agent.actorId,
        });
        return createCrmFromMessageInContext(context, identity(), input(reply.id));
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(crmAccounts)).toHaveLength(1);
});
