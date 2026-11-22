import { RepositoryContext } from "../../core/repository-context";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { listCrmActivity } from "../crm/activity";
import { crmActivityEvents } from "../crm/activity.schema";
import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";

const f = setupDatabase();
const discussionActions = ["discussion_linked", "discussion_unlinked"] as const;
const discussionEvents = (entityId: string) =>
  f.db
    .select()
    .from(crmActivityEvents)
    .where(
      and(
        eq(crmActivityEvents.entityId, entityId),
        inArray(crmActivityEvents.action, [...discussionActions]),
      ),
    );

test("association retries record one generic link and unlink event without exposing a private source", async () => {
  const { repos, reply } = await contextConversation(f);
  const contact = await repos.contacts.create({ displayName: "Customer" });
  const attached = await f.context().attach(reply.id, contact.entityId);
  const attachedAgain = await f.context().attach(reply.id, contact.entityId);
  expect(attached).toBe(true);
  expect(attachedAgain).toBe(false);
  expect((await discussionEvents(contact.entityId)).map((event) => event.action)).toEqual([
    "discussion_linked",
  ]);
  expect(await f.context("bob").related(contact.entityId)).toEqual([]);
  const detached = await f.context().detach(reply.id, contact.entityId);
  const detachedAgain = await f.context().detach(reply.id, contact.entityId);
  expect(detached).toBe(true);
  expect(detachedAgain).toBe(false);

  const events = await discussionEvents(contact.entityId);
  expect(events.map((event) => event.action).sort()).toEqual([...discussionActions].sort());
  for (const event of events) {
    expect(event.actorEntityId).toBe(f.alice);
    expect(event.relatedEntityId).toBeNull();
    expect(event.changedFields).toEqual([]);
  }
  const reader = new RepositoryContext(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  const page = await listCrmActivity(reader, contact.entityId);
  const visible = page.items.filter((event) =>
    discussionActions.some((action) => action === event.action),
  );
  expect(visible).toHaveLength(2);
  for (const event of visible)
    expect(event).toEqual({
      id: expect.any(String),
      entityId: contact.entityId,
      action: expect.stringMatching(/^discussion_(linked|unlinked)$/),
      changedFields: [],
      createdAt: expect.any(String),
      actor: { type: "human", displayName: "Alice" },
    });
});

test("an association creator can still unlink after their target access is reduced to view", async () => {
  const { chat, conversation, reply, repos } = await contextConversation(f);
  const account = await repos.crm.createAccount({ name: "Customer" });
  await chat.addMembers(conversation.id, ["bob@example.com"]);
  await repos.permissions.grant({
    entityId: account.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  await f.context("bob").attach(reply.id, account.entityId);
  await repos.permissions.grant({
    entityId: account.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await f.context("bob").detach(reply.id, account.entityId)).toBe(true);
  const events = await discussionEvents(account.entityId);
  expect(events.map((event) => event.action).sort()).toEqual([...discussionActions].sort());
  expect(events.every((event) => event.actorEntityId === f.bob)).toBe(true);
});

test("task and interaction associations do not add CRM discussion activity to their parents", async () => {
  const { repos, project, reply, chat, conversation } = await contextConversation(f);
  const contact = await repos.contacts.create({ displayName: "Customer" });
  const interaction = await repos.contactInteractions.createManual({
    contactEntityId: contact.entityId,
    kind: "call",
    occurredAt: new Date(),
    summary: "Call summary",
  });
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Follow up" });
  for (const id of [task.entityId, interaction.entityId]) {
    await f.context().attach(reply.id, id);
    await f.context().detach(reply.id, id);
  }
  await f.context().createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: reply.id,
    projectEntityId: project.entityId,
    title: "Source task",
  });
  await chat.sendMessage(conversation.id, `Please review @[task:${task.entityId}]`);
  expect(
    await f.db
      .select()
      .from(crmActivityEvents)
      .where(inArray(crmActivityEvents.action, [...discussionActions])),
  ).toEqual([]);
});
