import { AccessDeniedError, ConflictError } from "../../errors";
import { member, notifications, taskActivity, user } from "../../schema";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { waitForLockWaiters } from "../../testing/locks";
import { createAcceptedMessagingService } from "../../testing/messaging";
import { rejection } from "../../testing/rejection";
import { messageEntityReferences } from "../context/schema";
import { createContextService } from "../context/service";
import { messagingMessages, messagingReactions } from "./schema";
import { createMessagingService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("an open edit does not block a post or a reaction on another message", async () => {
  await f.verifyEmails();
  const channel = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "editing" });
  const original = await f.messaging("alice").sendMessage(channel.id, "original");
  const other = await f.messaging("bob").sendMessage(channel.id, "other");
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const open = f.db.transaction(async (tx) => {
    await createMessagingService(tx, { userId: "alice", organizationId: f.orgA }).editMessage(
      original.id,
      "edited",
    );
    held.resolve();
    await release.promise;
  });
  let concurrent: Promise<unknown> | undefined;
  try {
    await held.promise;
    concurrent = Promise.all([
      f.messaging("bob").sendMessage(channel.id, "while editing"),
      f.messaging("bob").toggleReaction(other.id, "👍"),
    ]);
    expect(
      await Promise.race([concurrent.then(() => "done"), Bun.sleep(1_000).then(() => "blocked")]),
    ).toBe("done");
  } finally {
    release.resolve();
    await Promise.all([open, concurrent]);
  }
  expect(
    (await f.messaging("alice").listMessages(channel.id)).map((message) => message.body),
  ).toEqual(["edited", "other", "while editing"]);
});

test("deletion waits for an open reaction and removes it after the reaction commits", async () => {
  await f.verifyEmails();
  const channel = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "reacting" });
  const message = await f.messaging("alice").sendMessage(channel.id, "secret");
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const open = f.db.transaction(async (tx) => {
    await createMessagingService(tx, { userId: "bob", organizationId: f.orgA }).toggleReaction(
      message.id,
      "👍",
    );
    held.resolve();
    await release.promise;
  });
  let deleting: Promise<{ id: string }> | undefined;
  try {
    await held.promise;
    deleting = f.messaging("alice").deleteMessage(message.id);
    await waitForLockWaiters(1);
  } finally {
    release.resolve();
    await Promise.all([open, deleting]);
  }
  expect(await f.db.select().from(messagingReactions)).toEqual([]);
  expect((await f.messaging("alice").listMessages(channel.id))[0]).toMatchObject({
    id: message.id,
    body: "",
    deletedAt: expect.any(Date),
  });
});

test("reactions and edits waiting for deletion cannot restore deleted message state", async () => {
  await f.verifyEmails();
  const channel = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "deleting" });
  const message = await f.messaging("alice").sendMessage(channel.id, "secret");
  const project = await f.forActor(f.alice).projects.create({ name: "No deleted sources" });
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const open = f.db.transaction(async (tx) => {
    await createMessagingService(tx, { userId: "alice", organizationId: f.orgA }).deleteMessage(
      message.id,
    );
    held.resolve();
    await release.promise;
  });
  let pending: Promise<unknown[]> | undefined;
  try {
    await held.promise;
    pending = Promise.all([
      rejection(f.messaging("bob").toggleReaction(message.id, "👍")),
      rejection(f.messaging("alice").editMessage(message.id, "restore")),
      rejection(context.attach(message.id, project.entityId)),
    ]);
    await waitForLockWaiters(3);
  } finally {
    release.resolve();
    await open;
  }
  for (const error of await pending!) expect(error).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(messagingReactions)).toEqual([]);
  expect(await f.db.select().from(messageEntityReferences)).toEqual([]);
  expect((await f.messaging("alice").listMessages(channel.id))[0]).toMatchObject({
    id: message.id,
    body: "",
    deletedAt: expect.any(Date),
  });
});

test("only the current human author can edit or delete, even against organization admins", async () => {
  await f.verifyEmails();
  const channel = await f.messaging("bob").createConversation({ kind: "channel", name: "team" });
  const sent = await f.messaging("bob").sendMessage(channel.id, "original");
  expect(await rejection(f.messaging("alice").editMessage(sent.id, "admin edit"))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(f.messaging("alice").deleteMessage(sent.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.messaging("bob").editMessage(sent.id, "revised");
  expect((await f.messaging("bob").listMessages(channel.id))[0]).toMatchObject({
    body: "revised",
    editedAt: expect.any(Date),
  });
  await f.messaging("bob").deleteMessage(sent.id);
  expect(await rejection(f.messaging("bob").editMessage(sent.id, "resurrect"))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("agent scopes cannot mutate messages, and owners cannot edit an agent's publications", async () => {
  const agent = await ownedAgent(f);
  const chat = f.messaging("alice");
  const channel = await chat.createConversation({ kind: "channel", name: "agent" });
  const automation = createAcceptedMessagingService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    actorEntityId: agent.actorId,
  });
  const human = await chat.sendMessage(channel.id, "Human text");
  const published = await automation.sendMessage(channel.id, "Agent text");
  expect(await rejection(automation.editMessage(published.id, "edit"))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(automation.deleteMessage(human.id))).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(chat.editMessage(published.id, "owner edit"))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(chat.deleteMessage(published.id))).toBeInstanceOf(AccessDeniedError);
});

test("host admins can remove internal members without gaining private message access", async () => {
  await f.verifyEmails();
  await f.db
    .insert(user)
    .values({ id: "carol", name: "Carol", email: "carol@example.com", emailVerified: true });
  await f.db.insert(member).values({ id: "carol-a", userId: "carol", organizationId: f.orgA });
  const channel = await f.messaging("bob").createConversation({
    kind: "channel",
    name: "secret",
    private: true,
    emails: ["carol@example.com"],
  });
  const [managed] = await f.messaging("alice").listManagedConversations();
  const carol = managed!.members.find((person) => person.userId === "carol")!;
  expect(await rejection(f.messaging("alice").listMessages(channel.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await f.messaging("alice").removeMember(channel.id, carol.actorId)).toEqual({
    removed: true,
    accessRevoked: true,
  });
  expect(await rejection(f.messaging("carol").listMessages(channel.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(f.messaging("alice").listMessages(channel.id))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("edits replace only derived references and do not redeliver notifications", async () => {
  await f.verifyEmails();
  const project = await f.forActor(f.alice).projects.create({ name: "Plan" });
  const channel = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "team", emails: ["bob@example.com"] });
  const other = await f.messaging("alice").createConversation({ kind: "channel", name: "other" });
  const sent = await f
    .messaging("alice")
    .sendMessage(
      channel.id,
      `@[person:${f.bob}] @[project:${project.entityId}] @[channel:${other.id}]`,
    );
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  await context.attach(sent.id, project.entityId);
  const before = await f.db.select().from(notifications);
  await f.messaging("alice").editMessage(sent.id, "revised");
  expect(await f.db.select().from(notifications)).toEqual(before);
  expect(await f.db.select().from(messageEntityReferences)).toMatchObject([
    { messageId: sent.id, purpose: "association" },
  ]);
  expect(
    await rejection(f.messaging("alice").editMessage(sent.id, `@[project:${crypto.randomUUID()}]`)),
  ).toBeInstanceOf(AccessDeniedError);
  expect((await f.messaging("alice").listMessages(channel.id))[0]!.body).toBe("revised");
});

test("deleted roots and replies erase content, retain thread links and task provenance, and remove alerts", async () => {
  await f.verifyEmails();
  const project = await f.forActor(f.alice).projects.create({ name: "Plan" });
  const channel = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "team", emails: ["bob@example.com"] });
  const root = await f
    .messaging("alice")
    .sendMessage(channel.id, `secret @[person:${f.bob}] @[project:${project.entityId}]`);
  const reply = await f.messaging("bob").sendMessage(channel.id, "reply secret", root.id);
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  const task = await context.createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: root.id,
    projectEntityId: project.entityId,
    title: "Follow up",
  });
  await f.messaging("alice").deleteMessage(root.id);
  await f.messaging("bob").deleteMessage(reply.id);
  expect(await f.db.select().from(messagingMessages)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: root.id, body: "", deletedAt: expect.any(Date) }),
      expect.objectContaining({
        id: reply.id,
        body: "",
        threadId: root.id,
        deletedAt: expect.any(Date),
      }),
    ]),
  );
  expect(await f.db.select().from(notifications)).toEqual([]);
  expect(await f.db.select().from(messageEntityReferences)).toMatchObject([
    { messageId: root.id, entityId: task.entityId, purpose: "source" },
  ]);
  expect(await f.db.select().from(taskActivity)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sourceMessageId: root.id, action: "Created from a discussion" }),
    ]),
  );
  expect((await f.messaging("alice").listMessages(channel.id))[0]).toMatchObject({
    id: root.id,
    body: "",
    replyCount: 1,
  });
  expect((await f.messaging("alice").listMessages(channel.id, root.id))[0]).toMatchObject({
    id: reply.id,
    body: "",
  });
  expect(await rejection(f.messaging("alice").toggleReaction(root.id, "👍"))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("lost private membership blocks edits and deletion of old authored messages", async () => {
  await f.verifyEmails();
  const group = await f
    .messaging("alice")
    .createConversation({ kind: "group", emails: ["bob@example.com", "outside@example.com"] });
  const sent = await f.messaging("bob").sendMessage(group.id, "original");
  await f.messaging("alice").removeMember(group.id, f.bob);
  expect(await rejection(f.messaging("bob").editMessage(sent.id, "hidden edit"))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(f.messaging("bob").deleteMessage(sent.id))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("internal removal checks host management, target kind, owner, self, and current role", async () => {
  await f.verifyEmails();
  const group = await f
    .messaging("bob")
    .createConversation({ kind: "group", emails: ["alice@example.com", "outside@example.com"] });
  expect(await rejection(f.messaging("alice").removeMember(group.id, f.bob))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(f.messaging("alice").removeMember(group.id, f.alice))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(await rejection(f.messaging("bob").removeMember(group.id, f.outsider))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  expect(await rejection(f.messaging("alice").removeMember(group.id, f.bob))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db.update(member).set({ role: "admin" }).where(eq(member.userId, "alice"));
  const secret = await f.messaging("bob").createConversation({
    kind: "channel",
    name: "secret",
    private: true,
    emails: ["alice@example.com"],
  });
  await f.messaging("bob").removeMember(secret.id, f.alice);
  expect(await rejection(f.messaging("alice").listMessages(secret.id))).toBeInstanceOf(
    AccessDeniedError,
  );
  const dm = await f
    .messaging("alice")
    .createConversation({ kind: "dm", emails: ["bob@example.com"] });
  expect(await rejection(f.messaging("alice").removeMember(dm.id, f.bob))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("request-id retries after edits or deletion cannot restore old bodies", async () => {
  await f.verifyEmails();
  const chat = f.messaging("alice");
  const channel = await chat.createConversation({ kind: "channel", name: "retries" });
  const requestId = crypto.randomUUID();
  const sent = await chat.sendMessage(channel.id, "secret", undefined, requestId);
  await chat.editMessage(sent.id, "revised");
  expect(
    await rejection(chat.sendMessage(channel.id, "secret", undefined, requestId)),
  ).toBeInstanceOf(ConflictError);
  expect(
    await rejection(chat.sendMessage(channel.id, "revised", undefined, requestId)),
  ).toBeInstanceOf(ConflictError);
  await chat.deleteMessage(sent.id);
  expect(
    await rejection(chat.sendMessage(channel.id, "secret", undefined, requestId)),
  ).toBeInstanceOf(ConflictError);
  expect((await chat.listMessages(channel.id))[0]).toMatchObject({
    body: "",
    attachments: [],
    canModify: false,
  });
});

test("deleted sources cannot create or attach new work and message context hides references", async () => {
  await f.verifyEmails();
  const project = await f.forActor(f.alice).projects.create({ name: "Plan" });
  const chat = f.messaging("alice");
  const channel = await chat.createConversation({ kind: "channel", name: "sources" });
  const sent = await chat.sendMessage(channel.id, "source");
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  await context.attach(sent.id, project.entityId);
  await chat.deleteMessage(sent.id);
  expect(await context.messagePage([sent.id])).toMatchObject([
    { messageId: sent.id, links: [], people: [], messaging: [] },
  ]);
  expect(await context.messageLinks(sent.id)).toEqual([]);
  expect(await rejection(context.attach(sent.id, project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  expect(
    await rejection(
      context.createTaskFromMessage({
        requestId: crypto.randomUUID(),
        messageId: sent.id,
        projectEntityId: project.entityId,
        title: "No new work",
      }),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

test("deleted messages disappear from indexed and empty-query search while live replies remain", async () => {
  await f.verifyEmails();
  const chat = f.messaging("alice");
  const channel = await chat.createConversation({ kind: "channel", name: "search" });
  const root = await chat.sendMessage(channel.id, "uniquedeletedsecret");
  const reply = await chat.sendMessage(channel.id, "livingreply", root.id);
  const context = createContextService(f.db, { userId: "alice", organizationId: f.orgA });
  await chat.deleteMessage(root.id);
  for (const query of ["", "uniquedeletedsecret"])
    expect((await context.search({ kind: "message", query })).map((item) => item.id)).not.toContain(
      root.id,
    );
  expect(
    (await context.search({ kind: "message", query: "livingreply" })).map((item) => item.id),
  ).toEqual([reply.id]);
  expect((await context.messageTarget(channel.id, reply.id)).root).toMatchObject({
    id: root.id,
    body: "",
    deletedAt: expect.any(Date),
  });
});

test("public channel removal ends participation but honestly retains public read and rejoin", async () => {
  await f.verifyEmails();
  const channel = await f
    .messaging("alice")
    .createConversation({ kind: "channel", name: "public", emails: ["bob@example.com"] });
  await f.messaging("alice").sendMessage(channel.id, "public words");
  expect(await f.messaging("alice").removeMember(channel.id, f.bob)).toEqual({
    removed: true,
    accessRevoked: false,
  });
  expect((await f.messaging("bob").listConversations())[0]).toMatchObject({ joined: false });
  expect((await f.messaging("bob").listMessages(channel.id))[0]!.body).toBe("public words");
  await f.messaging("bob").joinConversation(channel.id);
  expect((await f.messaging("bob").listConversations())[0]).toMatchObject({ joined: true });
});
