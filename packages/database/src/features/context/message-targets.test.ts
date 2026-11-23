import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { AccessDeniedError, ValidationError } from "../../errors";
import { entities, user, member, userAgents } from "../../schema";
import { contextConversation } from "../../testing/context";
import { setupDatabase } from "../../testing/database";
import { createAcceptedMessagingService } from "../../testing/messaging";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { createContextService } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();
const context = f.context;

const setup = () => contextConversation(f);

test("project discussions include task links while checking both work and conversation access", async () => {
  const { project, reply, root, repos, chat } = await setup();
  const task = await context().createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: reply.id,
    projectEntityId: project.entityId,
    title: "Milestone",
  });
  const publicChannel = await chat.createConversation({ kind: "channel", name: "Public updates" });
  const visible = await chat.sendMessage(publicChannel.id, `Review @[task:${task.entityId}]`);
  const otherProject = await repos.projects.create({ name: "Separate work" });
  await context().attach(visible.id, otherProject.entityId);
  await context().attach(root.id, project.entityId);
  const discussions = await context().related(project.entityId);
  expect(discussions.map((item) => item.messageId).sort()).toEqual(
    [reply.id, visible.id, root.id].sort(),
  );
  expect(discussions.find((item) => item.messageId === root.id)!.replyCount).toBe(1);
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await context("bob").related(project.entityId)).toMatchObject([{ messageId: visible.id }]);
  expect(await rejection(context("outsider", f.orgB).related(project.entityId))).toBeInstanceOf(
    AccessDeniedError,
  );
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, task.entityId));
  expect(await context().related(project.entityId)).toMatchObject([{ messageId: root.id }]);
});

test("project discussions include the thread roots of its tasks' own discussions", async () => {
  const { project, repos } = await setup();
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Draft" });
  const discussion = await repos.tasks.ensureDiscussion(task.entityId);
  const root = await f.messaging("alice").sendMessage(discussion, "Can we split this?");
  await f.messaging("alice").sendMessage(discussion, "Yes, I'll draft half.", root.id);
  const other = await repos.projects.create({ name: "Separate work" });
  const otherTask = await repos.tasks.create({ projectEntityId: other.entityId, title: "Other" });
  await f
    .messaging("alice")
    .sendMessage(await repos.tasks.ensureDiscussion(otherTask.entityId), "Elsewhere");
  expect(await context().related(project.entityId)).toMatchObject([
    { messageId: root.id, conversationId: discussion, purpose: "discussion", replyCount: 1 },
  ]);
  // The task's own discussion is shown on the task itself, not as a related discussion.
  expect(await context().related(task.entityId)).toEqual([]);
  // People who cannot see the task cannot see its discussion through the project either.
  await repos.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  expect(await context("bob").related(project.entityId)).toHaveLength(1);
  await f.db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(eq(entities.entityId, task.entityId));
  expect(await context().related(project.entityId)).toEqual([]);
});

test("message targets retain timeline reaction and reply summaries for roots and replies, and mismatched conversations fail", async () => {
  const { chat, reply, root, conversation } = await setup();
  await chat.addMembers(conversation.id, ["bob@example.com"]);
  const bob = createAcceptedMessagingService(f.db, { userId: "bob", organizationId: f.orgA });
  await chat.toggleReaction(root.id, "👍");
  await bob.toggleReaction(root.id, "👍");
  await bob.toggleReaction(reply.id, "🎉");
  const [timelineRoot] = await chat.listMessages(conversation.id);
  const [timelineReply] = await chat.listMessages(conversation.id, root.id);
  expect(timelineRoot).toMatchObject({
    replyCount: 1,
    reactions: [{ emoji: "👍", count: 2, reacted: true }],
  });
  expect(timelineReply).toMatchObject({
    replyCount: 0,
    reactions: [{ emoji: "🎉", count: 1, reacted: false }],
  });
  const { db, queries } = recordQueries();
  const target = createContextService(db, { userId: "alice", organizationId: f.orgA });
  for (const message of [timelineRoot!, timelineReply!]) {
    queries.length = 0;
    expect(await target.messageTarget(conversation.id, message.id)).toEqual({
      message,
      root: timelineRoot!,
    });
    expect(queries.filter((query) => query.includes('from "messaging_reactions"'))).toHaveLength(1);
    expect(
      queries.filter(
        (query) => query.includes('from "messaging_messages"') && query.includes("count(*)"),
      ),
    ).toHaveLength(1);
    // Workspace context, message with root and authors, two summary reads, and attachments.
    expect(queries).toHaveLength(5);
  }
  await chat.toggleReaction(root.id, "👍");
  await bob.sendMessage(conversation.id, "Another reply", root.id);
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    root: { replyCount: 2, reactions: [{ emoji: "👍", count: 1, reacted: false }] },
    message: { replyCount: 0, reactions: [{ emoji: "🎉", count: 1, reacted: false }] },
  });
  expect(await rejection(context().messageTarget(crypto.randomUUID(), reply.id))).toBeInstanceOf(
    AccessDeniedError,
  );
});

test("batched message targets match single targets with constant reads and omit hidden, missing and mismatched ones", async () => {
  const { chat, reply, root, conversation } = await setup();
  const channel = await chat.createConversation({ kind: "channel", name: "Public targets" });
  const posts = [];
  for (let index = 0; index < 5; index++)
    posts.push(await chat.sendMessage(channel.id, `Post ${index}`));
  const publicReply = await chat.sendMessage(channel.id, "Public reply", posts[0]!.id);
  const targets = [
    { conversationId: conversation.id, messageId: reply.id },
    { conversationId: conversation.id, messageId: root.id },
    { conversationId: channel.id, messageId: publicReply.id },
    ...posts.map((post) => ({ conversationId: channel.id, messageId: post.id })),
  ];
  const denied = [
    { conversationId: channel.id, messageId: reply.id },
    { conversationId: conversation.id, messageId: crypto.randomUUID() },
  ];
  const { db, queries } = recordQueries();
  const service = createContextService(db, { userId: "alice", organizationId: f.orgA });
  const reads = async (input: typeof targets) => {
    queries.length = 0;
    const result = await service.messageTargets(input);
    return { result, count: queries.length };
  };
  const one = await reads(targets.slice(0, 1));
  const all = await reads([...targets, ...denied, targets[0]!]);
  expect(all.count).toBe(one.count);
  expect(all.count).toBe(5);
  const singles = [];
  for (const target of targets)
    singles.push(await context().messageTarget(target.conversationId, target.messageId));
  expect(all.result).toEqual(singles);
  expect(one.result).toEqual(singles.slice(0, 1));
  // Bob sees only the public channel; the private targets are left out without an error.
  expect((await context("bob").messageTargets(targets)).map((target) => target.message.id)).toEqual(
    [publicReply.id, ...posts.map((post) => post.id)],
  );
  expect(await context("bob").messageTargets(targets.slice(0, 2))).toEqual([]);
  expect(await context().messageTargets([])).toEqual([]);
  expect(
    await rejection(context().messageTargets(Array.from({ length: 51 }, () => targets[0]!))),
  ).toBeInstanceOf(ValidationError);
});

test("related discussions use current human names for local and partner authors", async () => {
  const { chat, conversation, root, project } = await setup();
  await chat.addMembers(conversation.id, ["outside@example.com"]);
  const reply = await createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  }).sendMessage(conversation.id, "Partner reply", root.id);
  await context().attach(root.id, project.entityId);
  await context().attach(reply.id, project.entityId);
  await f.db.update(user).set({ name: "Alice renamed" }).where(eq(user.id, "alice"));
  await f.db.update(user).set({ name: "Partner renamed" }).where(eq(user.id, "outsider"));
  expect(
    (await context().related(project.entityId)).map((row) => ({
      messageId: row.messageId,
      authorName: row.authorName,
      authorType: row.authorType,
    })),
  ).toEqual([
    { messageId: root.id, authorName: "Alice renamed", authorType: "human" },
    { messageId: reply.id, authorName: "Partner renamed", authorType: "human" },
  ]);
});

test("message targets use current human names for the root and partner reply", async () => {
  const { chat, conversation, root } = await setup();
  await chat.addMembers(conversation.id, ["outside@example.com"]);
  const reply = await createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  }).sendMessage(conversation.id, "Partner reply", root.id);
  await f.db.update(user).set({ name: "Alice renamed" }).where(eq(user.id, "alice"));
  await f.db.update(user).set({ name: "Partner renamed" }).where(eq(user.id, "outsider"));
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    root: { id: root.id, authorName: "Alice renamed", authorType: "human", authorExternal: false },
    message: {
      id: reply.id,
      authorName: "Partner renamed",
      authorType: "human",
      authorExternal: true,
    },
  });
});

test("related discussions and message targets retain agent attribution after owner rename", async () => {
  const { chat, project } = await setup();
  const [agent] = await f.db
    .insert(userAgents)
    .values({
      userId: "alice",
      name: "Research",
      instructions: "",
      harness: "opencode",
    })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: agent!.id,
  });
  const conversation = await chat.createConversation({ kind: "channel", name: "Agent discussion" });
  const agentChat = createAcceptedMessagingService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
    actorEntityId: actor.entityId,
  });
  const root = await agentChat.sendMessage(conversation.id, "Agent root");
  const reply = await agentChat.sendMessage(conversation.id, "Agent reply", root.id);
  await context().attach(root.id, project.entityId);
  await context().attach(reply.id, project.entityId);
  await f.db.update(user).set({ name: "Alice renamed" }).where(eq(user.id, "alice"));
  const attribution = { authorName: "Research", authorType: "agent" };
  expect(await context().related(project.entityId)).toMatchObject([
    { messageId: root.id, ...attribution },
    { messageId: reply.id, ...attribution },
  ]);
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    root: { id: root.id, ...attribution, authorExternal: false },
    message: { id: reply.id, ...attribution, authorExternal: false },
  });
});

test("linked message targets classify root and reply authors by current viewer membership", async () => {
  const { chat, conversation, root } = await setup();
  await chat.addMembers(conversation.id, ["outside@example.com"]);
  const partner = createAcceptedMessagingService(f.db, {
    userId: "outsider",
    organizationId: f.orgB,
  });
  const reply = await partner.sendMessage(conversation.id, "Partner reply", root.id);
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    message: { id: reply.id, authorExternal: true },
    root: { id: root.id, authorExternal: false },
  });
  expect(await context("outsider", f.orgB).messageTarget(conversation.id, reply.id)).toMatchObject({
    message: { id: reply.id, authorExternal: false },
    root: { id: root.id, authorExternal: true },
  });
  await f.db
    .insert(member)
    .values({ id: "outsider-a", userId: "outsider", organizationId: f.orgA });
  expect(await context().messageTarget(conversation.id, reply.id)).toMatchObject({
    message: { id: reply.id, authorExternal: false },
    root: { id: root.id, authorExternal: false },
  });
  expect(await rejection(context("bob").messageTarget(conversation.id, reply.id))).toBeInstanceOf(
    AccessDeniedError,
  );
});
