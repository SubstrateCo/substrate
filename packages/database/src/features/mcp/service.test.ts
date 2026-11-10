import type { WorkspaceApiRequest } from "@startup-os/contracts/harness/mcp";
import { mcpTools, type McpOutput, type ServerToolName } from "@startup-os/contracts/harness/tools";

import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { registerDevice } from "../../core/devices/repository";
import { AccessDeniedError, ConflictError } from "../../errors";
import {
  member,
  user,
  userAgents,
  taskActivity,
  taskComments,
  messageEntityReferences,
  messagingMessages,
  messagingParticipants,
} from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { createMessagingService } from "../messaging/service";
import { executeAgentTool } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */
const f = setupDatabase();

// An interactive turn without a source place on the agent's home desktop: every tool may run,
// and reply needs a `to`.
const turn = {
  turnId: crypto.randomUUID(),
  attempt: 1,
  sessionKey: `routine:${crypto.randomUUID()}`,
  origin: null,
  kind: "interactive" as const,
  installationId: crypto.randomUUID(),
};

async function fixture() {
  await f.db.update(user).set({ emailVerified: true });
  const device = await registerDevice(f.db, "alice", {
    installationId: turn.installationId,
    name: "Laptop",
    platform: "win32",
  });
  const [agent] = await f.db
    .insert(userAgents)
    .values({
      userId: "alice",
      name: "Research",
      instructions: "",
      harness: "opencode",
      homeDeviceId: device.id,
    })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: agent!.id,
  });
  const identity = { organizationId: f.orgA, userId: "alice", actorEntityId: actor.entityId };
  const human = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  // Each call parses its result with the tool's own output schema, as the MCP server does.
  const call = async <K extends ServerToolName>(tool: K, input: WorkspaceApiRequest["input"]) =>
    // SAFETY: the result was parsed with the output schema registered for tool K.
    mcpTools[tool].output.parse(
      (await executeAgentTool(f.db, identity, tool, input, turn)).output,
    ) as McpOutput<K>;
  const createTask = (input: WorkspaceApiRequest["input"]) =>
    call("create_task", { requestId: crypto.randomUUID(), projectId: project.entityId, ...input });
  return { actor, agentId: agent!.id, identity, human, project, call, createTask };
}

async function setCreatedAt(id: string, createdAt: string) {
  await f.db
    .update(messagingMessages)
    .set({ createdAt: new Date(createdAt) })
    .where(eq(messagingMessages.id, id));
}

test("task tools use the owner's access, attribute writes and keep the source message across retries", async () => {
  const { actor, human, call } = await fixture();
  await f.db.update(member).set({ role: "member" }).where(eq(member.userId, "alice"));
  const project = await f.forActor(f.bob).projects.create({ name: "Shared" });
  await expect(call("get_project", { projectId: project.entityId })).rejects.toBeInstanceOf(
    AccessDeniedError,
  );
  await f.forActor(f.bob).permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.alice,
    level: "edit",
  });
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const message = await human.sendMessage(channel.id, "Please follow up");
  const input = {
    requestId: crypto.randomUUID(),
    projectId: project.entityId,
    title: "Follow up",
    sourceMessageId: message.id,
  };
  const created = await call("create_task", input);
  expect(created.source).toEqual({
    type: "message",
    id: message.id,
    conversationId: channel.id,
    threadId: null,
  });
  expect(await call("create_task", input)).toEqual(created);
  await expect(call("create_task", { ...input, title: "Different" })).rejects.toBeInstanceOf(
    ConflictError,
  );
  const events = await f.db
    .select()
    .from(taskActivity)
    .where(eq(taskActivity.taskEntityId, created.id));
  expect(events).toHaveLength(2);
  expect(events.every((event) => event.actorEntityId === actor.entityId)).toBe(true);
  const [source] = await f.db
    .select()
    .from(messageEntityReferences)
    .where(eq(messageEntityReferences.entityId, created.id));
  expect(source).toMatchObject({ purpose: "source", createdByActorEntityId: actor.entityId });
  const commentInput = {
    requestId: crypto.randomUUID(),
    taskId: created.id,
    body: "Working on it",
  };
  const comment = await call("add_task_comment", commentInput);
  expect(await call("add_task_comment", commentInput)).toEqual(comment);
  expect(await f.db.select().from(taskComments)).toHaveLength(1);
  expect((await call("list_task_comments", { taskId: created.id })).items[0]?.author.id).toBe(
    actor.entityId,
  );
  const updated = await call("update_task", {
    requestId: crypto.randomUUID(),
    taskId: created.id,
    changes: { status: "completed" },
  });
  expect(updated).toMatchObject({ status: "completed", commentCount: 1, linkedMessageCount: 1 });
  expect((await call("get_project", { projectId: project.entityId })).taskCounts).toMatchObject({
    completed: 1,
    not_started: 0,
  });
  expect(
    (await call("list_tasks", { projectId: project.entityId, statuses: ["completed"] })).items.map(
      (item) => item.id,
    ),
  ).toEqual([created.id]);
  expect(
    (await call("list_task_activity", { taskId: created.id })).items.every(
      (item) => item.actor.type === "agent",
    ),
  ).toBe(true);
  const link = { messageId: message.id, target: { type: "task", id: created.id } };
  const attached = [await call("attach_message", link), await call("attach_message", link)];
  expect(attached).toEqual([{ changed: true }, { changed: false }]);
  expect(
    (await call("list_links", { target: { type: "message", id: message.id } })).items
      .map((item) => `${item.kind}:${item.work?.id}`)
      .toSorted(),
  ).toEqual([`attachment:${created.id}`, `origin:${created.id}`]);
  expect(await call("detach_message", link)).toEqual({ changed: true });
  expect(
    (await call("list_links", { target: { type: "task", id: created.id } })).items.map(
      (item) => item.kind,
    ),
  ).toEqual(["origin"]);
  await f
    .forActor(f.bob)
    .permissions.revoke({ entityId: project.entityId, actorEntityId: f.alice });
  await expect(call("create_task", input)).rejects.toBeInstanceOf(AccessDeniedError);
});

test("a task created from a thread reply links to a message that read_thread can open", async () => {
  const { human, call, createTask } = await fixture();
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const root = await human.sendMessage(channel.id, "Launch plan");
  const first = await human.sendMessage(channel.id, "We need a checklist", root.id);
  await human.sendMessage(channel.id, "Agreed", root.id);
  const task = await createTask({ title: "Write checklist", sourceMessageId: first.id });
  const [linked] = (await call("list_links", { target: { type: "task", id: task.id } })).items;
  expect(linked?.message).toMatchObject({
    id: first.id,
    threadId: root.id,
    text: "We need a checklist",
  });
  const thread = await call("read_thread", { messageId: linked!.message!.id });
  expect(thread.root.body).toBe("Launch plan");
  expect(thread.replies.items.map((item) => item.body)).toEqual(["We need a checklist", "Agreed"]);
});

test("read_conversation shows older threads with replies in the window, with one cursor", async () => {
  const { human, call } = await fixture();
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const old = await human.sendMessage(channel.id, "old root");
  await setCreatedAt(old.id, "2026-11-06T12:00:00Z");
  const reply = await human.sendMessage(channel.id, "today's reply", old.id);
  await setCreatedAt(reply.id, "2026-11-07T15:00:00Z");
  for (const [body, createdAt] of [
    ["before", "2026-11-06T23:59:59Z"],
    ["start", "2026-11-07T00:00:00Z"],
    ["middle", "2026-11-07T12:00:00Z"],
    ["end", "2026-11-08T00:00:00Z"],
  ] as const)
    await setCreatedAt((await human.sendMessage(channel.id, body)).id, createdAt);
  const input = {
    conversationId: channel.id,
    since: "2026-11-07T00:00:00Z",
    until: "2026-11-08T00:00:00Z",
    limit: 2,
  };
  const first = await call("read_conversation", input);
  expect(first.items.map((item) => [item.text, item.includedBecause])).toEqual([
    ["old root", "thread_activity"],
    ["middle", "posted"],
  ]);
  expect(first.items[0]).toMatchObject({ replyCount: 1, truncated: false });
  const second = await call("read_conversation", { ...input, cursor: first.nextCursor });
  expect(second.items.map((item) => item.text)).toEqual(["start"]);
  expect(second.nextCursor).toBeNull();
  await expect(
    call("read_conversation", {
      ...input,
      since: "2026-11-06T00:00:00Z",
      cursor: first.nextCursor,
    }),
  ).rejects.toThrow("cursor");
  expect(
    (await call("list_conversations", { activeSince: input.since })).items.map((item) => item.id),
  ).toEqual([channel.id]);
});

test("task counts and links leave out messages in conversations the caller cannot see", async () => {
  const { human, call, createTask, project } = await fixture();
  await f.forActor(f.alice).permissions.grant({
    entityId: project.entityId,
    actorEntityId: f.bob,
    level: "view",
  });
  const task = await createTask({ title: "Launch" });
  const bob = createMessagingService(f.db, { organizationId: f.orgA, userId: "bob" });
  const hidden = await bob.createConversation({ kind: "channel", name: "bob-only", private: true });
  await bob.sendMessage(hidden.id, `See @[task:${task.id}]`);
  const visible = await human.createConversation({ kind: "channel", name: "general" });
  const mention = await human.sendMessage(visible.id, `Working on @[task:${task.id}]`);
  expect(await call("get_task", { taskId: task.id })).toMatchObject({ linkedMessageCount: 1 });
  expect(
    (await call("list_links", { target: { type: "task", id: task.id } })).items.map((item) => [
      item.kind,
      item.message?.id,
    ]),
  ).toEqual([["mention", mention.id]]);
});

test("assignees resolve by name and list_tasks accepts me for the agent's own tasks", async () => {
  const { actor, call, createTask, project } = await fixture();
  const [assignee] = (await call("list_assignees", { projectId: project.entityId, query: "resea" }))
    .items;
  expect(assignee).toEqual({ id: actor.entityId, name: "Research", type: "agent" });
  const mine = await createTask({ title: "Mine", assigneeActorId: assignee!.id });
  await createTask({ title: "Unassigned" });
  expect(
    (await call("list_tasks", { projectId: project.entityId, assigneeActorId: "me" })).items.map(
      (item) => item.id,
    ),
  ).toEqual([mine.id]);
});

test("conversations are named after other participants and sorted by latest activity", async () => {
  const { human, call } = await fixture();
  const dm = await human.createConversation({ kind: "dm", emails: ["bob@example.com"] });
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  await setCreatedAt((await human.sendMessage(channel.id, "older")).id, "2026-11-06T00:00:00Z");
  await setCreatedAt((await human.sendMessage(dm.id, "newer")).id, "2026-11-07T00:00:00Z");
  expect((await call("list_conversations", {})).items.map((item) => item.name)).toEqual([
    "Bob",
    "general",
  ]);
});

test("conversation names leave out partners who have not consented", async () => {
  const { human, call, agentId } = await fixture();
  const group = await human.createConversation({
    kind: "group",
    emails: ["bob@example.com"],
    agentIds: [agentId],
  });
  await f.db.insert(messagingParticipants).values({
    conversationId: group.id,
    organizationId: f.orgB,
    actorEntityId: f.outsider,
    actorType: "human",
  });
  expect((await call("list_conversations", {})).items).toMatchObject([{ name: "Bob" }]);
});

test("get_me returns the agent, its owner's actor and the organization", async () => {
  const { actor, call } = await fixture();
  expect(await call("get_me", {})).toEqual({
    actor: { id: actor.entityId, name: "Research", type: "agent" },
    owner: { id: f.alice, name: "Alice" },
    organization: { id: f.orgA, name: "A" },
  });
});

test("search pages with a cursor bound to its query", async () => {
  const { call, createTask } = await fixture();
  for (const title of ["Launch one", "Launch two", "Launch three"]) await createTask({ title });
  const input = { query: "Launch", type: "task", limit: 2 };
  const first = await call("search", input);
  expect(first.items).toHaveLength(2);
  const second = await call("search", { ...input, cursor: first.nextCursor });
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(3);
  await expect(
    call("search", { ...input, query: "Other", cursor: first.nextCursor }),
  ).rejects.toThrow("cursor");
});

test("reply resolves the agent once and does not re-authenticate inside messaging", async () => {
  const { human, identity } = await fixture();
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const { db, queries } = recordQueries();
  const input = {
    requestId: crypto.randomUUID(),
    body: "Agent note",
    to: { conversationId: channel.id },
  };
  const sent = await executeAgentTool(db, identity, "reply", input, turn);
  expect(
    (await human.listMessages(channel.id)).find((item) => item.id === sent.output.messageId)
      ?.authorType,
  ).toBe("agent");
  const identityReads = () => queries.filter((query) => query.includes('from "user"'));
  expect(identityReads()).toHaveLength(1);
  queries.length = 0;
  expect((await executeAgentTool(db, identity, "reply", input, turn)).output).toEqual(sent.output);
  expect(identityReads()).toHaveLength(1);
});

test("failed source validation rolls back task creation; foreign owners and organizations cannot impersonate agents", async () => {
  const { identity, project, createTask } = await fixture();
  const before = (await f.forActor(f.alice).tasks.list(project.entityId)).length;
  await expect(
    createTask({ title: "No", sourceMessageId: crypto.randomUUID() }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  expect((await f.forActor(f.alice).tasks.list(project.entityId)).length).toBe(before);
  await expect(
    executeAgentTool(f.db, { ...identity, userId: "bob" }, "list_projects", {}, turn),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    executeAgentTool(f.db, { ...identity, organizationId: f.orgB }, "list_projects", {}, turn),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});
