import { realtimeKeys } from "@startup-os/contracts/realtime";

import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { member, notifications, taskActivity, user } from "../../schema";
import { setupDatabase } from "../../testing/database";
import { createAcceptedMessagingService } from "../../testing/messaging";
import { messageEntityReferences, messageMessagingReferences } from "../context/schema";
import { createContextService } from "../context/service";
import { createFeedService } from "../notifications/service";
import { messagingConversations, messagingMessages } from "./schema";
/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const chat = (userId: string, organizationId = f.orgA) =>
  createAcceptedMessagingService(f.db, { userId, organizationId });
const listed = async (userId: string, organizationId = f.orgA) =>
  (await chat(userId, organizationId).listConversations()).map((row) => ({
    id: row.id,
    joined: row.joined,
  }));

async function verified() {
  await f.db.update(user).set({ emailVerified: true });
}

test("leaving a private conversation removes access until the owner adds the member back", async () => {
  await verified();
  const channel = await chat("alice").createConversation({
    kind: "channel",
    name: "private",
    private: true,
    emails: ["bob@example.com"],
  });
  const before = await chat("bob").sendMessage(channel.id, "before leaving");
  await chat("bob").leaveConversation(channel.id);
  expect(await listed("bob")).toEqual([]);
  await expect(chat("bob").listMessages(channel.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(chat("bob").sendMessage(channel.id, "back?")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  const [row] = await chat("alice").listConversations();
  expect(row!.members.map((person) => person.userId)).toEqual(["alice"]);
  expect((await chat("alice").listMessages(channel.id)).map((message) => message.id)).toEqual([
    before.id,
  ]);
  expect(await chat("alice").addMembers(channel.id, ["bob@example.com"])).toEqual({ added: 1 });
  expect(await listed("bob")).toEqual([{ id: channel.id, joined: true }]);
});

test("leaving a public channel hides it and stops reply alerts, while posting rejoins", async () => {
  await verified();
  const channel = await chat("alice").createConversation({ kind: "channel", name: "general" });
  const root = await chat("bob").sendMessage(channel.id, "root");
  await chat("bob").leaveConversation(channel.id);
  expect(await listed("bob")).toEqual([{ id: channel.id, joined: false }]);
  expect(await chat("bob").listMessages(channel.id)).toHaveLength(1);
  const feed = createFeedService(f.db, { userId: "bob", organizationId: f.orgA });
  await chat("alice").sendMessage(channel.id, "reply", root.id);
  expect(await feed.list()).toEqual([]);
  await chat("alice").sendMessage(channel.id, `@[person:${f.bob}]`, root.id);
  expect((await feed.list()).map((item) => item.kind)).toEqual(["mention"]);
  await chat("bob").sendMessage(channel.id, "back");
  expect(await listed("bob")).toEqual([{ id: channel.id, joined: true }]);
});

test("public channels are listed as joined only for active members", async () => {
  await verified();
  const channel = await chat("alice").createConversation({ kind: "channel", name: "general" });
  expect(await listed("alice")).toEqual([{ id: channel.id, joined: true }]);
  expect(await listed("bob")).toEqual([{ id: channel.id, joined: false }]);
  await chat("bob").leaveConversation(channel.id);
  expect(await listed("bob")).toEqual([{ id: channel.id, joined: false }]);
  await chat("bob").joinConversation(channel.id);
  expect(await listed("bob")).toEqual([{ id: channel.id, joined: true }]);
});

test("owners pass ownership before leaving, and the last member must delete instead", async () => {
  await verified();
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const group = await chat("alice").createConversation({
    kind: "group",
    emails: ["bob@example.com", "outside@example.com"],
  });
  await expect(chat("alice").leaveConversation(group.id)).rejects.toBeInstanceOf(ConflictError);
  await expect(chat("alice").leaveConversation(group.id, "nobody")).rejects.toBeInstanceOf(
    ValidationError,
  );
  await chat("alice").leaveConversation(group.id, "bob");
  const [owned] = await f.db
    .select()
    .from(messagingConversations)
    .where(eq(messagingConversations.id, group.id));
  expect(owned!.createdBy).toBe("bob");
  await expect(chat("alice").addMembers(group.id, ["alice@example.com"])).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await chat("outsider", f.orgB).leaveConversation(group.id);
  await expect(chat("bob").leaveConversation(group.id)).rejects.toBeInstanceOf(ConflictError);
  await expect(chat("bob").leaveConversation(group.id, "outsider")).rejects.toBeInstanceOf(
    ValidationError,
  );
});

test("direct messages cannot be left or deleted, even by admins", async () => {
  await verified();
  const dm = await chat("bob").createConversation({ kind: "dm", emails: ["alice@example.com"] });
  await expect(chat("bob").leaveConversation(dm.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(chat("alice").deleteConversation(dm.id)).rejects.toBeInstanceOf(AccessDeniedError);
});

test("owners and admins of the owning organization manage conversations without reading them", async () => {
  await verified();
  const secret = await chat("bob").createConversation({
    kind: "channel",
    name: "secret",
    private: true,
  });
  await chat("alice").addMembers(secret.id, ["outside@example.com"]);
  await chat("bob").sendMessage(secret.id, "private words");
  // alice is an organization owner but not a member.
  expect(await listed("alice")).toEqual([]);
  await expect(chat("alice").listMessages(secret.id)).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await chat("alice").listManagedConversations()).toMatchObject([
    { id: secret.id, name: "secret", private: true, ownerName: "Bob" },
  ]);
  await expect(chat("bob").listManagedConversations()).rejects.toBeInstanceOf(AccessDeniedError);
  // Managing never becomes reading: an admin cannot add themselves or take ownership.
  expect(await chat("alice").addMembers(secret.id, ["alice@example.com"])).toEqual({ added: 0 });
  await expect(chat("alice").transferOwnership(secret.id, "alice")).rejects.toBeInstanceOf(
    ValidationError,
  );
  await expect(chat("alice").listMessages(secret.id)).rejects.toBeInstanceOf(AccessDeniedError);
  // A member from another organization cannot manage it, even as that organization's owner.
  await expect(chat("outsider", f.orgB).deleteConversation(secret.id)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await expect(chat("alice").transferOwnership(secret.id, "outsider")).rejects.toBeInstanceOf(
    ValidationError,
  );
  const [owned] = await f.db
    .select()
    .from(messagingConversations)
    .where(eq(messagingConversations.id, secret.id));
  expect(owned!.createdBy).toBe("bob");
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  await expect(chat("alice").deleteConversation(secret.id)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.update(member).set({ role: "admin" }).where(eq(member.userId, "alice"));
  await chat("alice").deleteConversation(secret.id);
  expect(await listed("bob")).toEqual([]);
});

test("members who are not the owner cannot delete or change the owner", async () => {
  await verified();
  const channel = await chat("bob").createConversation({
    kind: "channel",
    name: "team",
    emails: ["alice@example.com"],
  });
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  await expect(chat("alice").deleteConversation(channel.id)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await expect(chat("alice").transferOwnership(channel.id, "alice")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  expect((await chat("bob").listConversations())[0]).toMatchObject({ canManage: true });
  expect((await chat("alice").listConversations())[0]).toMatchObject({ canManage: false });
});

test("deleting a conversation keeps task history and removes links, references and alerts", async () => {
  await verified();
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Work" });
  const channel = await chat("alice").createConversation({
    kind: "channel",
    name: "doomed",
    emails: ["bob@example.com"],
  });
  const other = await chat("alice").createConversation({ kind: "channel", name: "other" });
  const source = await chat("alice").sendMessage(channel.id, `Hi @[person:${f.bob}]`);
  const task = await createContextService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
  }).createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: source.id,
    projectEntityId: project.entityId,
    title: "Follow up",
  });
  const mention = await chat("alice").sendMessage(other.id, `See @[channel:${channel.id}]`);

  const { hints } = await chat("alice").deleteConversation(channel.id);

  expect(hints).toEqual(
    expect.arrayContaining([
      { audience: realtimeKeys.user("bob"), domain: "messaging" },
      { audience: realtimeKeys.organization(f.orgA), domain: "messaging" },
      { audience: realtimeKeys.organization(f.orgA), domain: "context" },
      { audience: realtimeKeys.actor(f.orgA, f.bob), domain: "notifications" },
    ]),
  );
  expect(
    await f.db
      .select()
      .from(messagingMessages)
      .where(eq(messagingMessages.conversationId, channel.id)),
  ).toEqual([]);
  expect(
    await f.db
      .select()
      .from(messageEntityReferences)
      .where(eq(messageEntityReferences.messageId, source.id)),
  ).toEqual([]);
  expect(
    await f.db
      .select()
      .from(messageMessagingReferences)
      .where(eq(messageMessagingReferences.messageId, mention.id)),
  ).toEqual([]);
  expect(
    await f.db.select().from(notifications).where(eq(notifications.messageId, source.id)),
  ).toEqual([]);
  const history = await f.db
    .select()
    .from(taskActivity)
    .where(eq(taskActivity.taskEntityId, task.entityId));
  expect(history.find((row) => row.action === "Created from a discussion")).toMatchObject({
    sourceMessageId: null,
  });
  expect(
    (
      await createFeedService(f.db, { userId: "alice", organizationId: f.orgA }).activity(
        task.entityId,
      )
    ).map((row) => row.action),
  ).toContain("Created from a discussion");
});

test("delete impact counts only linked work the caller can read", async () => {
  await verified();
  const bob = f.forActor(f.bob);
  const project = await bob.projects.create({ name: "Bob's" });
  const channel = await chat("bob").createConversation({ kind: "channel", name: "general" });
  const message = await chat("bob").sendMessage(channel.id, "Plan");
  const context = createContextService(f.db, { userId: "bob", organizationId: f.orgA });
  for (const title of ["One", "Two"])
    await context.createTaskFromMessage({
      requestId: crypto.randomUUID(),
      messageId: message.id,
      projectEntityId: project.entityId,
      title,
    });
  expect(await chat("bob").deleteImpact(channel.id)).toEqual({ linkedWork: 2 });
  // carol is an organization member with no access to Bob's project.
  await f.db.insert(user).values({
    id: "carol",
    name: "Carol",
    email: "carol@example.com",
    emailVerified: true,
  });
  await f.db.insert(member).values({ id: "carol-a", userId: "carol", organizationId: f.orgA });
  await chat("carol").sendMessage(channel.id, "joined");
  await chat("bob").transferOwnership(channel.id, "carol");
  expect(await chat("carol").deleteImpact(channel.id)).toEqual({ linkedWork: 0 });
});

test("agents cannot leave, delete, or manage conversations", async () => {
  await verified();
  const channel = await chat("alice").createConversation({ kind: "channel", name: "general" });
  const agent = createAcceptedMessagingService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    actorEntityId: crypto.randomUUID(),
  });
  await expect(agent.deleteConversation(channel.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(agent.leaveConversation(channel.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(agent.transferOwnership(channel.id, "bob")).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
});
