import { AccessDeniedError } from "../../errors";
import { ActorRepositories } from "../../repositories";
import { entityGrants, member, storedFiles } from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { agentWorkItems } from "../agent-work/work-items.schema";
import { messagingConversations } from "../messaging/schema";
import { messagingMessages, messagingParticipants } from "../messaging/schema";
import { createSharingService } from "../messaging/sharing/service";
import { notifications } from "../notifications/schema";
import { audienceRecipients, resolveReceiver } from "../realtime/audience";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("discussion resolves once, inherits task access, and cannot be managed independently", async () => {
  await f.verifyEmails();
  const alice = new ActorRepositories(f.db, { organizationId: f.orgA, actorEntityId: f.alice });
  const bob = new ActorRepositories(f.db, { organizationId: f.orgA, actorEntityId: f.bob });
  const project = await alice.projects.create({ name: "Discussion" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Discuss" });
  expect(await f.db.select().from(messagingConversations)).toEqual([]);
  const [id, again] = await Promise.all([
    alice.tasks.ensureDiscussion(task.entityId),
    alice.tasks.ensureDiscussion(task.entityId),
  ]);
  expect(id).toBe(again);
  expect(await rejection(f.messaging("bob").listMessages(id))).toBeInstanceOf(AccessDeniedError);
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await bob.tasks.ensureDiscussion(task.entityId)).toBe(id);
  expect(await f.messaging("bob").listMessages(id)).toEqual([]);
  expect(await rejection(f.messaging("bob").sendMessage(id, "No"))).toBeInstanceOf(
    AccessDeniedError,
  );
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "comment",
  });
  await f.messaging("bob").sendMessage(id, "Ready");
  expect((await f.messaging("alice").listMessages(id)).map((row) => row.body)).toEqual(["Ready"]);
  expect(await rejection(f.messaging("alice").joinConversation(id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(f.messaging("alice").deleteConversation(id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(f.messaging("alice").addMembers(id, ["bob@example.com"]))).toBeInstanceOf(
    AccessDeniedError,
  );
  await alice.tasks.delete(task.entityId, project.entityId);
  expect(await rejection(f.messaging("bob").listMessages(id))).toBeInstanceOf(AccessDeniedError);
});

test("moving a task revokes historical authors across messages, search, metadata, unread and realtime", async () => {
  await f.verifyEmails();
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Shared" });
  const destination = await alice.projects.create({ name: "Private" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "comment",
  });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Discuss" });
  const id = await alice.tasks.ensureDiscussion(task.entityId);
  const message = await f.messaging("bob").sendMessage(id, "uniquediscussionmarker");
  const [file] = await f.db
    .insert(storedFiles)
    .values({
      id: crypto.randomUUID(),
      organizationId: f.orgA,
      uploadedBy: "alice",
      purpose: "file",
      filename: "evidence.txt",
      contentType: "text/plain",
      size: 6,
      objectKey: crypto.randomUUID(),
      sha256: "a".repeat(64),
    })
    .returning();
  const attached = await f
    .messaging("alice")
    .sendMessage(id, "Another message", undefined, undefined, [file!.id]);
  const fileTarget = {
    conversationId: id,
    messageId: attached.id,
    attachmentId: attached.attachments[0]!.id,
  };
  expect(await (await f.forSession("bob")).files.messageContent(fileTarget)).toMatchObject({
    id: file!.id,
  });
  const bob = await resolveReceiver(f.db, { userId: "bob", organizationId: f.orgA });
  const before = await audienceRecipients(f.db, ["conversation", id]);
  expect(before(bob!)).toBe(true);
  expect(
    (await f.context("bob").search({ kind: "message", query: "uniquediscussionmarker" })).map(
      (row) => row.id,
    ),
  ).toContain(message.id);
  await alice.tasks.move(task.entityId, project.entityId, destination.entityId, null);
  expect(
    (await f.db.select().from(messagingParticipants)).some((row) => row.actorEntityId === f.bob),
  ).toBe(true);
  expect(await rejection(f.messaging("bob").listMessages(id))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(f.messaging("bob").markRead(id, message.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(f.context("bob").messagePage([message.id]))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await f.messaging("bob").unreadCounts()).toEqual([]);
  expect(
    await rejection((await f.forSession("bob")).files.messageContent(fileTarget)),
  ).toBeInstanceOf(AccessDeniedError);
  expect(
    await f.context("bob").search({ kind: "message", query: "uniquediscussionmarker" }),
  ).toEqual([]);
  const after = await audienceRecipients(f.db, ["conversation", id]);
  expect(after(bob!)).toBe(false);
  await alice.permissions.grant({
    entityId: destination.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await f.forActor(f.bob).tasks.ensureDiscussion(task.entityId, destination.entityId)).toBe(
    id,
  );
  expect((await f.messaging("bob").listMessages(id)).map((row) => row.id)).toContain(message.id);
  expect(await rejection(f.messaging("bob").editMessage(message.id, "No"))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(f.messaging("bob").deleteMessage(message.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(f.messaging("bob").toggleReaction(message.id, "+1"))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("parsed references and edits never remove the task's structural discussion binding", async () => {
  await f.verifyEmails();
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "References" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Discuss" });
  const other = await alice.tasks.create({ projectEntityId: project.entityId, title: "Related" });
  const id = await alice.tasks.ensureDiscussion(task.entityId);
  const message = await f.messaging("alice").sendMessage(id, `See @[task:${other.entityId}]`);
  expect((await f.context("alice").messagePage([message.id]))[0]!.links).toMatchObject([
    { entityId: other.entityId, purpose: "mention" },
  ]);
  await f.messaging("alice").editMessage(message.id, "Reference removed");
  expect((await f.context("alice").messagePage([message.id]))[0]!.links).toEqual([]);
  expect(await alice.tasks.ensureDiscussion(task.entityId)).toBe(id);
  expect(
    (
      await f.context("alice").search({ kind: "task", query: "", relatedToEntityId: message.id })
    ).map((row) => row.id),
  ).toContain(task.entityId);
  expect(
    (
      await f
        .context("alice")
        .search({ kind: "message", query: "", relatedToEntityId: task.entityId })
    ).map((row) => row.id),
  ).toContain(message.id);
  expect(await f.messaging("alice").listConversations()).toEqual([]);
  expect(await f.context("alice").search({ kind: "conversation", query: "Discuss" })).toMatchObject(
    [{ id, title: "Discuss" }],
  );
  await alice.tasks.update(task.entityId, { title: "Renamed discussion" });
  expect(await f.context("alice").search({ kind: "conversation", query: "Renamed" })).toMatchObject(
    [{ id, title: "Renamed discussion" }],
  );
  expect(await f.context("alice").search({ kind: "conversation", query: "Discuss" })).toMatchObject(
    [{ id, title: "Renamed discussion" }],
  );
  expect(await f.messaging("alice").listConversations(id)).toMatchObject([
    {
      id,
      task: {
        taskEntityId: task.entityId,
        projectEntityId: project.entityId,
        title: "Renamed discussion",
      },
      canPost: true,
    },
  ]);
});

test("task readers may be mentioned without joining; discussions send mentions only", async () => {
  await f.verifyEmails();
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Shared" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Discuss" });
  const id = await alice.tasks.ensureDiscussion(task.entityId);
  expect(
    await rejection(f.messaging("alice").sendMessage(id, `@[person:${f.bob}]`)),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(messagingMessages)).toEqual([]);
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "comment",
  });
  const sent = await f.messaging("alice").sendMessage(id, `@[person:${f.bob}] Ready`);
  expect(await f.db.select().from(notifications)).toMatchObject([
    { kind: "mention", messageId: sent.id },
  ]);
  await f.messaging("bob").sendMessage(id, "Reply", sent.id);
  expect(await f.db.select().from(notifications)).toHaveLength(1);
  expect(await f.db.select().from(agentWorkItems)).toEqual([]);
  expect(
    await rejection(
      createSharingService(f.db, { userId: "alice", organizationId: f.orgA }).invite(id, {
        email: "outside@example.com",
        shareHistory: true,
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  await f.db.update(member).set({ role: "admin" }).where(eq(member.userId, "bob"));
  await f.db.delete(entityGrants).where(eq(entityGrants.actorEntityId, f.bob));
  expect((await f.messaging("bob").listMessages(id)).map((row) => row.id)).toEqual([sent.id]);
  expect((await f.messaging("bob").listMessages(id, sent.id)).map((row) => row.body)).toEqual([
    "Reply",
  ]);
  expect(await f.messaging("bob").listManagedConversations()).toEqual([]);
});

test("an enabled owner agent gets work for a normal mention but never for the same task discussion mention", async () => {
  const agent = await ownedAgent(f);
  const normal = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "Agent baseline" });
  await f.messaging("alice").addAgent(normal.id, agent.agentId);
  const body = `@[agent:${agent.actorId}] Please investigate`;
  const baseline = await f.messaging("alice").sendMessage(normal.id, body);
  expect(await f.db.select().from(agentWorkItems)).toMatchObject([
    { sourceRef: { source: "owner_message", messageId: baseline.id } },
  ]);
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Agent task" });
  const task = await alice.tasks.create({ projectEntityId: project.entityId, title: "Discussion" });
  const conversationId = await alice.tasks.ensureDiscussion(task.entityId);
  // A historical agent participant makes this input wake-eligible without granting any access.
  await f.db.insert(messagingParticipants).values({
    conversationId,
    organizationId: f.orgA,
    actorEntityId: agent.actorId,
    actorType: "agent",
  });
  const sent = await f.messaging("alice").sendMessage(conversationId, body);
  expect((await f.messaging("alice").listMessages(conversationId)).map((row) => row.id)).toEqual([
    sent.id,
  ]);
  const wakes = await f.db.select().from(agentWorkItems);
  expect(wakes).toMatchObject([{ sourceRef: { messageId: baseline.id } }]);
  expect(wakes).toHaveLength(1);
});
