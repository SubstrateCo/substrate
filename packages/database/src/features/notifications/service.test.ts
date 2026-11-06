/* oxlint-disable typescript/await-thenable -- Bun's rejects matchers return promises at runtime. */
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { setupDatabase } from "../../testing/database";
import { user } from "../../core/authentication/schema";
import { AccessDeniedError } from "../../errors";
import { createMessagingService } from "../messaging/service";
import { createContextService } from "../context/service";
import { createFeedService } from "./service";
import { notifications } from "./schema";

const f = setupDatabase();
const feed = (userId: string) => createFeedService(f.db, { userId, organizationId: f.orgA });
async function setup() {
  await f.db.update(user).set({ emailVerified: true });
  const alice = f.forActor(f.alice);
  const project = await alice.projects.create({ name: "Shared work" });
  await alice.permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "edit",
  });
  const chat = createMessagingService(f.db, { userId: "alice", organizationId: f.orgA });
  const channel = await chat.createConversation({
    kind: "channel",
    name: "Private",
    private: true,
  });
  return { alice, project, chat, channel };
}

test("assignment notifications exclude self and unchanged assignments; read state is recipient-owned and revocation hides content", async () => {
  const { alice, project } = await setup();
  const task = await alice.tasks.create({
    projectEntityId: project.entityId,
    title: "Ship",
    assigneeActorEntityId: f.bob,
  });
  expect(await feed("alice").list()).toEqual([]);
  const [notice] = await feed("bob").list();
  expect(notice).toMatchObject({
    title: "Ship",
    kind: "assignment",
    entityId: task.entityId,
    readAt: null,
  });
  await expect(feed("alice").markRead(notice!.id)).rejects.toBeInstanceOf(AccessDeniedError);
  await feed("bob").markRead(notice!.id);
  expect((await feed("bob").list())[0]!.readAt).not.toBeNull();
  await alice.tasks.update(task.entityId, { assigneeActorEntityId: f.bob, title: "Ship" });
  expect(await feed("bob").list()).toHaveLength(1);
  expect((await feed("bob").activity(task.entityId)).map((event) => event.action)).toEqual([
    "Task created",
  ]);
  await alice.permissions.revoke({ entityId: project.entityId, actorEntityId: f.bob });
  expect(await feed("bob").list()).toEqual([]);
});

test("mentions notify accessible recipients once, reply notifications are deduplicated, and invalid references roll back sends", async () => {
  const { chat, channel, project } = await setup();
  await chat.addMembers(channel.id, ["bob@example.com"]);
  const root = await chat.sendMessage(
    channel.id,
    `Hello @[person:${f.bob}]`,
    undefined,
    crypto.randomUUID(),
  );
  expect(await feed("bob").list()).toMatchObject([{ kind: "mention", messageId: root.id }]);
  const requestId = crypto.randomUUID();
  const bobChat = createMessagingService(f.db, { userId: "bob", organizationId: f.orgA });
  const reply = await bobChat.sendMessage(channel.id, "Reply", root.id, requestId);
  await bobChat.sendMessage(channel.id, "Reply", root.id, requestId);
  expect(await feed("alice").list()).toMatchObject([{ kind: "reply", messageId: reply.id }]);
  const before = await chat.listMessages(channel.id);
  await expect(chat.sendMessage(channel.id, `Bad @[person:${f.outsider}]`)).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await expect(
    chat.sendMessage(channel.id, `Bad @[task:${project.entityId}]`),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  expect(await chat.listMessages(channel.id)).toEqual(before);
});

test("private source activity is filtered independently from ordinary task activity", async () => {
  const { project, chat, channel } = await setup();
  const source = await chat.sendMessage(channel.id, "Private evidence");
  const task = await createContextService(f.db, {
    userId: "alice",
    organizationId: f.orgA,
  }).createTaskFromMessage({
    requestId: crypto.randomUUID(),
    messageId: source.id,
    projectEntityId: project.entityId,
    title: "Work",
  });
  expect((await feed("alice").activity(task.entityId)).map((event) => event.action)).toContain(
    "Created from a discussion",
  );
  expect((await feed("bob").activity(task.entityId)).map((event) => event.action)).toEqual([
    "Task created",
  ]);
});

test("notification and activity writes roll back with the task transaction", async () => {
  const { project } = await setup();
  await expect(
    f.forActor(f.alice).transaction(async (repos) => {
      await repos.tasks.create({
        projectEntityId: project.entityId,
        title: "Rollback",
        assigneeActorEntityId: f.bob,
      });
      throw new Error("abort");
    }),
  ).rejects.toThrow("abort");
  expect(
    await f.db.select().from(notifications).where(eq(notifications.recipientActorEntityId, f.bob)),
  ).toEqual([]);
  expect(await f.forActor(f.alice).tasks.list(project.entityId)).toEqual([]);
});
