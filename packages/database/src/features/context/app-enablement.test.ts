import { organizationApps } from "../../core/apps/schema";
import { AccessDeniedError, AppDisabledError } from "../../errors";
import {
  entities,
  entityLinks,
  messageEntityReferences,
  notifications,
  storedFiles,
  tasks,
} from "../../schema";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function setApp(appId: "tasks" | "crm", enabled: boolean) {
  await f.db
    .insert(organizationApps)
    .values({ organizationId: f.orgA, appId, enabled })
    .onConflictDoUpdate({
      target: [organizationApps.organizationId, organizationApps.appId],
      set: { enabled },
    });
}

test("disabling Tasks hides direct IDs, discussion messages, search, backlinks, files and notifications without deleting data", async () => {
  await f.verifyEmails();
  const a = f.forActor(f.alice);
  const project = await a.projects.create({ name: "Secret launch" });
  const task = await a.tasks.create({
    projectEntityId: project.entityId,
    title: "Secret shipment",
  });
  const contact = await a.contacts.create({ displayName: "Shared buyer" });
  await a.links.create({ entityId: contact.entityId, otherEntityId: task.entityId });
  const discussionId = await a.tasks.ensureDiscussion(task.entityId);
  const chat = f.messaging("alice");
  const discussionMessage = await chat.sendMessage(discussionId, "Private task discussion");
  const channel = await chat.createConversation({ kind: "channel", name: "Shared" });
  const reference = await chat.sendMessage(channel.id, `See @[task:${task.entityId}]`);
  const session = await f.forSession("alice");
  const [file] = await f.db
    .insert(storedFiles)
    .values({
      id: crypto.randomUUID(),
      organizationId: f.orgA,
      uploadedBy: "alice",
      purpose: "file",
      filename: "secret.txt",
      contentType: "text/plain",
      size: 6,
      objectKey: crypto.randomUUID(),
      sha256: "a".repeat(64),
    })
    .returning();
  const target = { projectEntityId: project.entityId, taskEntityId: task.entityId };
  await session.files.addTask({ ...target, attachmentFileIds: [file!.id] });
  const [attachment] = await session.files.listTask(target);
  await f.db.insert(notifications).values({
    organizationId: f.orgA,
    recipientActorEntityId: f.alice,
    entityId: task.entityId,
    kind: "assignment",
    eventKey: "app-test",
  });
  expect(await session.context.messageLinks(reference.id)).toMatchObject([{ title: task.title }]);
  expect(await session.feed.hasUnread()).toBe(true);
  const linksBefore = await f.db.select().from(entityLinks);
  const referencesBefore = await f.db.select().from(messageEntityReferences);

  await setApp("tasks", false);
  for (const operation of [
    () => a.entities.get(task.entityId),
    () => a.tasks.get(task.entityId),
    () => a.projects.get(project.entityId),
    () => session.files.listTask(target),
    () => session.files.taskContent({ ...target, attachmentId: attachment!.id }),
    () => a.tasks.update(task.entityId, { title: "Changed" }),
  ])
    expect(await rejection(operation())).toBeInstanceOf(AppDisabledError);
  expect(await rejection(f.forActor(f.bob).tasks.get(task.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  for (const operation of [
    () => chat.listMessages(discussionId),
    () => session.context.messagePage([discussionMessage.id]),
  ])
    expect(await rejection(operation())).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(a.projects.create({ name: "New" }))).toBeInstanceOf(AppDisabledError);
  expect(await session.context.search({ query: "Secret" })).toEqual([]);
  expect(await session.context.messageLinks(reference.id)).toEqual([]);
  expect(await a.links.list(contact.entityId)).toEqual([]);
  expect(await session.feed.list()).toEqual([]);
  expect(await session.feed.hasUnread()).toBe(false);
  expect(await session.context.search({ query: "See", kind: "message" })).toMatchObject([
    { id: reference.id, excerpt: "See a task" },
  ]);
  expect((await chat.listConversations(discussionId)).some((row) => row.id === discussionId)).toBe(
    false,
  );
  expect(await f.db.select().from(entityLinks)).toEqual(linksBefore);
  expect(await f.db.select().from(messageEntityReferences)).toEqual(referencesBefore);
  expect((await f.db.select().from(tasks).where(eq(tasks.entityId, task.entityId)))[0]?.title).toBe(
    task.title,
  );
  expect(
    (await f.db.select().from(entities).where(eq(entities.entityId, task.entityId)))[0]?.deletedAt,
  ).toBeNull();

  await setApp("tasks", true);
  expect((await a.tasks.get(task.entityId)).title).toBe(task.title);
  expect(await session.context.messageLinks(reference.id)).toMatchObject([{ title: task.title }]);
});

test("CRM is independent of Tasks, but follow-ups need both apps and retain record access checks", async () => {
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Customer" });
  const project = await a.projects.create({ name: "Follow-ups" });
  await setApp("tasks", false);
  const stages = await a.crm.ensurePipeline();
  const deal = await a.crm.createDeal({
    title: "Sale",
    accountEntityId: account.entityId,
    stageId: stages[0]!.id,
  });
  expect((await a.crm.getDeal(deal.entityId)).deal.title).toBe("Sale");
  expect(await rejection(f.forActor(f.bob).crm.getDeal(deal.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection(
      a.crm.createFollowUp({
        entityId: deal.entityId,
        projectEntityId: project.entityId,
        title: "Call",
        requestId: crypto.randomUUID(),
        consentToTaskAudience: true,
      }),
    ),
  ).toBeInstanceOf(AppDisabledError);
  await setApp("tasks", true);
  await setApp("crm", false);
  expect((await a.projects.get(project.entityId)).name).toBe("Follow-ups");
  expect(await rejection(a.entities.get(deal.entityId))).toBeInstanceOf(AppDisabledError);
  expect(await rejection(a.crm.pipeline())).toBeInstanceOf(AppDisabledError);
  expect(await rejection(a.crm.createAccount({ name: "Denied" }))).toBeInstanceOf(AppDisabledError);
});

test("shared contacts stay available while CRM profile metadata and account backlinks are hidden", async () => {
  const a = f.forActor(f.alice);
  const contact = await a.contacts.createContact({ displayName: "Buyer" });
  const account = await a.crm.createAccount({ name: "Private company" });
  await a.crm.setAffiliation({
    contactEntityId: contact.entityId,
    accountEntityId: account.entityId,
    title: "CEO",
    isPrimary: true,
  });
  await a.contacts.archive(contact.entityId, true);
  await setApp("crm", false);
  expect(await a.contacts.getContact(contact.entityId)).toMatchObject({
    profile: { displayName: "Buyer" },
    affiliations: [],
    archivedAt: null,
  });
  expect(await a.contacts.listContacts()).toMatchObject([
    { contact: { entityId: contact.entityId }, archivedAt: null },
  ]);
  expect((await a.contacts.createContact({ displayName: "New buyer" })).displayName).toBe(
    "New buyer",
  );
  expect(
    (await a.contacts.updateContact(contact.entityId, { displayName: "Updated buyer" }))
      .displayName,
  ).toBe("Updated buyer");
  expect(await rejection(a.crm.activity(contact.entityId))).toBeInstanceOf(AppDisabledError);
  expect(await rejection(a.contacts.archive(contact.entityId, false))).toBeInstanceOf(
    AppDisabledError,
  );
});

test("disabled CRM associations lose metadata in generic message context while ordinary messages and edges remain", async () => {
  await f.verifyEmails();
  const a = f.forActor(f.alice);
  const account = await a.crm.createAccount({ name: "Secret company" });
  const contact = await a.contacts.create({ displayName: "Shared buyer" });
  await a.links.create({ entityId: contact.entityId, otherEntityId: account.entityId });
  const chat = f.messaging("alice");
  const channel = await chat.createConversation({ kind: "channel", name: "Shared" });
  const message = await chat.sendMessage(channel.id, "Ordinary discussion");
  const session = await f.forSession("alice");
  await session.context.attach(message.id, account.entityId);
  expect(await session.context.messageLinks(message.id)).toMatchObject([
    { title: "Secret company" },
  ]);
  const edges = await f.db.select().from(messageEntityReferences);
  await setApp("crm", false);
  expect(await session.context.messageLinks(message.id)).toEqual([]);
  expect(await session.context.messagePage([message.id])).toMatchObject([{ links: [] }]);
  expect(await session.context.search({ query: "Secret", kind: "account" })).toEqual([]);
  expect(await a.links.list(contact.entityId)).toEqual([]);
  expect((await chat.listMessages(channel.id))[0]?.body).toBe("Ordinary discussion");
  expect(await rejection(session.context.related(account.entityId))).toBeInstanceOf(
    AppDisabledError,
  );
  expect(await f.db.select().from(messageEntityReferences)).toEqual(edges);
});
