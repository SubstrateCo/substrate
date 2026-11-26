import { organizationApps } from "../../core/apps/schema";
import { contactIdentifiers } from "../../core/contacts/schema";
import { entityLinks } from "../../core/links/schema";
import { setupDatabase } from "../../testing/database";
import { crmStages } from "../crm/schema";
import { beforeEach, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";

const f = setupDatabase();
beforeEach(async () => {
  await f.verifyEmails();
});

const stage = async (organizationId: string, name: string) =>
  (
    await f.db
      .insert(crmStages)
      .values({ organizationId, name, position: 100 })
      .returning({ id: crmStages.id })
  )[0]!.id;

const identifier = async (organizationId: string, contactEntityId: string, value: string) =>
  (
    await f.db
      .insert(contactIdentifiers)
      .values({ organizationId, contactEntityId, type: "email", value })
      .returning({ id: contactIdentifiers.id })
  )[0]!.id;

async function linkBetween(sourceEntityId: string, targetEntityId: string) {
  const [row] = await f.db
    .select({ id: entityLinks.id })
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.sourceEntityId, sourceEntityId),
        eq(entityLinks.targetEntityId, targetEntityId),
      ),
    );
  return row!.id;
}

test("labels name each kind of record the reader can open, with its project or conversation", async () => {
  const bob = f.forActor(f.bob);
  const project = await bob.projects.create({ name: "Launch" });
  const first = await bob.tasks.create({ projectEntityId: project.entityId, title: "Draft" });
  const second = await bob.tasks.create({ projectEntityId: project.entityId, title: "Review" });
  await bob.tasks.addLink(first.entityId, "blocks", second.entityId);
  const link = await linkBetween(first.entityId, second.entityId);
  const messaging = f.messaging("bob");
  const channel = await messaging.createConversation({ kind: "channel", name: "general" });
  const message = await messaging.sendMessage(channel.id, "Ship it on Friday");
  const contact = await bob.contacts.create({ displayName: "Ada Park" });
  const email = await identifier(f.orgA, contact.entityId, "ada@example.com");
  const negotiation = await stage(f.orgA, "Negotiation");

  const ids = [
    project.entityId,
    first.entityId,
    link,
    channel.id,
    message.id,
    f.alice,
    contact.entityId,
    email,
    negotiation,
  ];
  const items = await (await f.forSession("bob")).context.recordLabels(ids);
  expect(items).toEqual([
    {
      id: project.entityId,
      type: "project",
      title: "Launch",
      projectId: null,
      conversationId: null,
    },
    {
      id: first.entityId,
      type: "task",
      title: "Draft",
      projectId: project.entityId,
      conversationId: null,
    },
    {
      id: link,
      type: "task_link",
      title: "Draft blocks Review",
      projectId: project.entityId,
      conversationId: null,
    },
    {
      id: channel.id,
      type: "conversation",
      title: "general",
      projectId: null,
      conversationId: channel.id,
    },
    {
      id: message.id,
      type: "message",
      title: "Ship it on Friday",
      projectId: null,
      conversationId: channel.id,
    },
    { id: f.alice, type: "actor", title: "Alice", projectId: null, conversationId: null },
    {
      id: contact.entityId,
      type: "contact",
      title: "Ada Park",
      projectId: null,
      conversationId: null,
    },
    {
      id: email,
      type: "contact_detail",
      title: "ada@example.com",
      projectId: null,
      conversationId: null,
    },
    {
      id: negotiation,
      type: "pipeline_stage",
      title: "Negotiation",
      projectId: null,
      conversationId: null,
    },
  ]);
});

test("hidden records, other organizations' records and unknown IDs are left out", async () => {
  // Alice's private work, which Bob, a member without grants, cannot open.
  const alice = f.forActor(f.alice);
  const secret = await alice.projects.create({ name: "Secret plan" });
  const hiddenTask = await alice.tasks.create({
    projectEntityId: secret.entityId,
    title: "Hidden",
  });
  const bob = f.forActor(f.bob);
  const own = await bob.projects.create({ name: "Mine" });
  const ownTask = await bob.tasks.create({ projectEntityId: own.entityId, title: "Visible" });
  // Alice, an organization owner, can open both tasks, so she can link them.
  await alice.tasks.addLink(hiddenTask.entityId, "blocks", ownTask.entityId);
  const halfHidden = await linkBetween(hiddenTask.entityId, ownTask.entityId);
  const privateChannel = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "secret-room", private: true });
  const privateMessage = await f.messaging("alice").sendMessage(privateChannel.id, "Secret body");

  // Another organization's records, people and pipeline.
  const outside = f.forActor(f.outsider, f.orgB);
  const otherProject = await outside.projects.create({ name: "Other org" });
  const otherContact = await outside.contacts.create({ displayName: "Outside contact" });
  const otherEmail = await identifier(f.orgB, otherContact.entityId, "outside@example.com");
  const otherStage = await stage(f.orgB, "Other stage");

  const ids = [
    secret.entityId,
    hiddenTask.entityId,
    halfHidden,
    privateChannel.id,
    privateMessage.id,
    otherProject.entityId,
    otherContact.entityId,
    otherEmail,
    otherStage,
    f.outsider,
    crypto.randomUUID(),
  ];
  const items = await (await f.forSession("bob")).context.recordLabels(ids);
  expect(items).toEqual([]);
  // The owner sees their own records under the same rules.
  const aliceItems = await (await f.forSession("alice")).context.recordLabels(ids);
  expect(aliceItems.map((item) => item.id)).toEqual([
    secret.entityId,
    hiddenTask.entityId,
    halfHidden,
    privateChannel.id,
    privateMessage.id,
  ]);
});

test("pipeline stages are named only while CRM is enabled", async () => {
  const negotiation = await stage(f.orgA, "Negotiation");
  const labels = async () =>
    (await (await f.forSession("bob")).context.recordLabels([negotiation])).map((item) => item.id);
  expect(await labels()).toEqual([negotiation]);
  await f.db
    .update(organizationApps)
    .set({ enabled: false })
    .where(and(eq(organizationApps.organizationId, f.orgA), eq(organizationApps.appId, "crm")));
  expect(await labels()).toEqual([]);
});
