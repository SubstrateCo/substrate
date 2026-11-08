import type { WorkspaceApiRequest } from "@startup-os/contracts/harness/mcp";
import { mcpTools, type McpToolName } from "@startup-os/contracts/harness/tools";

import { ensureUserAgentActor } from "../../core/actors/provisioning";
import { AccessDeniedError, ConflictError } from "../../errors";
import {
  member,
  user,
  userAgents,
  taskActivity,
  taskComments,
  messageEntityReferences,
  messagingMessages,
} from "../../schema";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { createMessagingService } from "../messaging/service";
import { executeAgentTool } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */
const f = setupDatabase();

async function fixture() {
  await f.db.update(user).set({ emailVerified: true });
  const [agent] = await f.db
    .insert(userAgents)
    .values({ userId: "alice", name: "Research", instructions: "", harness: "opencode" })
    .returning();
  const actor = await ensureUserAgentActor(f.db, {
    organizationId: f.orgA,
    userId: "alice",
    userAgentId: agent!.id,
  });
  const identity = { organizationId: f.orgA, userId: "alice", actorEntityId: actor.entityId };
  const human = createMessagingService(f.db, { organizationId: f.orgA, userId: "alice" });
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const call = async (tool: McpToolName, input: WorkspaceApiRequest["input"]) =>
    (await executeAgentTool(f.db, identity, tool, input)).output;
  return { actor, identity, human, project, call };
}

test("task tools use the owner's access, attribute writes and preserve source links across retries", async () => {
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
    source: { type: "message", conversationId: channel.id, messageId: message.id },
  };
  const created = mcpTools.create_task.output.parse(await call("create_task", input));
  expect(created.createdBy).toMatchObject({ id: actor.entityId, type: "agent" });
  expect(await call("create_task", input)).toEqual(created);
  await expect(call("create_task", { ...input, title: "Different" })).rejects.toBeInstanceOf(
    ConflictError,
  );
  const events = await f.db
    .select()
    .from(taskActivity)
    .where(eq(taskActivity.taskEntityId, created.taskId));
  expect(events).toHaveLength(2);
  expect(events.every((event) => event.actorEntityId === actor.entityId)).toBe(true);
  const [source] = await f.db
    .select()
    .from(messageEntityReferences)
    .where(eq(messageEntityReferences.entityId, created.taskId));
  expect(source).toMatchObject({
    purpose: "source",
    createdByActorEntityId: actor.entityId,
    messageId: message.id,
  });
  const commentInput = {
    requestId: crypto.randomUUID(),
    taskId: created.taskId,
    body: "Working on it",
  };
  const comment = await call("add_task_comment", commentInput);
  expect(await call("add_task_comment", commentInput)).toEqual(comment);
  expect(await f.db.select().from(taskComments)).toHaveLength(1);
  expect(
    mcpTools.list_task_comments.output.parse(
      await call("list_task_comments", { taskId: created.taskId }),
    ).items[0]?.author.id,
  ).toBe(actor.entityId);
  await call("update_task", { taskId: created.taskId, changes: { status: "completed" } });
  expect(
    mcpTools.get_task.output.parse(await call("get_task", { taskId: created.taskId })),
  ).toMatchObject({ title: "Follow up", status: "completed" });
  expect(
    mcpTools.get_project.output
      .parse(await call("get_project", { projectId: project.entityId, statuses: ["completed"] }))
      .tasks.items.map((item) => item.id),
  ).toEqual([created.taskId]);
  expect(
    mcpTools.list_activity.output
      .parse(await call("list_activity", { taskId: created.taskId }))
      .items.every((item) => item.actor.type === "agent"),
  ).toBe(true);
  const related = mcpTools.get_related_context.output.parse(
    await call("get_related_context", { target: { type: "task", id: created.taskId } }),
  );
  expect(related.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ relationship: "source", target: input.source }),
      expect.objectContaining({
        relationship: "parent",
        target: { type: "project", id: project.entityId },
      }),
    ]),
  );
  const back = mcpTools.get_related_context.output.parse(
    await call("get_related_context", { target: input.source }),
  );
  expect(back.items[0]?.target).toEqual({ type: "task", id: created.taskId });
  const link = { message: input.source, target: { type: "task", id: created.taskId } };
  const attached = await call("attach_reference", link);
  const repeated = await call("attach_reference", link);
  expect(attached).toMatchObject({ changed: true });
  expect(repeated).toMatchObject({ changed: false });
  expect(await call("remove_reference", link)).toMatchObject({ changed: true });
  expect((await f.db.select().from(messageEntityReferences)).map((row) => row.purpose)).toEqual([
    "source",
  ]);
  await f
    .forActor(f.bob)
    .permissions.revoke({ entityId: project.entityId, actorEntityId: f.alice });
  await expect(call("create_task", input)).rejects.toBeInstanceOf(AccessDeniedError);
});

test("daily scans include active older threads without expanding reply bodies", async () => {
  const { human, call, actor } = await fixture();
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const root = await human.sendMessage(channel.id, "old root");
  await f.db
    .update(messagingMessages)
    .set({ createdAt: new Date("2026-11-06T12:00:00Z") })
    .where(eq(messagingMessages.id, root.id));
  const reply = await human.sendMessage(channel.id, "today's reply", root.id);
  await f.db
    .update(messagingMessages)
    .set({ createdAt: new Date("2026-11-07T12:00:00Z") })
    .where(eq(messagingMessages.id, reply.id));
  const since = "2026-11-07T00:00:00Z",
    until = "2026-11-08T00:00:00Z";
  const result = mcpTools.list_messages.output.parse(
    await call("list_messages", { conversationId: channel.id, since, until }),
  );
  expect(result.messages.items).toEqual([]);
  expect(result.activeThreads?.items).toEqual([
    {
      threadId: root.id,
      rootMessageId: root.id,
      replyCountInWindow: 1,
      lastReplyAt: "2026-11-07T12:00:00.000Z",
    },
  ]);
  const thread = mcpTools.list_messages.output.parse(
    await call("list_messages", { conversationId: channel.id, threadId: root.id, since, until }),
  );
  expect(thread.messages.items.map((item) => item.body)).toEqual(["today's reply"]);
  expect(thread.activeThreads).toBeUndefined();
  expect(
    mcpTools.list_conversations.output
      .parse(await call("list_conversations", { activeSince: since }))
      .items.map((item) => item.id),
  ).toEqual([channel.id]);
  const sent = mcpTools.send_message.output.parse(
    await call("send_message", {
      requestId: crypto.randomUUID(),
      conversationId: channel.id,
      body: "Agent reply",
      threadId: root.id,
    }),
  );
  expect(sent.author).toMatchObject({ id: actor.entityId, type: "agent" });
  expect(
    (await human.listMessages(channel.id, root.id)).find((item) => item.id === sent.messageId)
      ?.authorType,
  ).toBe("agent");
});

test("send_message resolves the agent once and does not re-authenticate inside messaging", async () => {
  const { human, identity, actor } = await fixture();
  const channel = await human.createConversation({ kind: "channel", name: "general" });
  const { db, queries } = recordQueries();
  const input = { requestId: crypto.randomUUID(), conversationId: channel.id, body: "Agent note" };
  const sent = await executeAgentTool(db, identity, "send_message", input);
  expect(sent.output.author).toEqual({ id: actor.entityId, name: "Research", type: "agent" });
  const identityReads = () => queries.filter((query) => query.includes('from "user"'));
  expect(identityReads()).toHaveLength(1);
  expect(queries).toHaveLength(7);
  queries.length = 0;
  expect((await executeAgentTool(db, identity, "send_message", input)).output).toEqual(sent.output);
  expect(identityReads()).toHaveLength(1);
  expect(queries).toHaveLength(3);
});

test("failed source validation rolls back task creation; foreign owners and organizations cannot impersonate agents", async () => {
  const { identity, project, call } = await fixture();
  const before = (await f.forActor(f.alice).tasks.list(project.entityId)).length;
  await expect(
    call("create_task", {
      requestId: crypto.randomUUID(),
      projectId: project.entityId,
      title: "No",
      source: {
        type: "message",
        conversationId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
      },
    }),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  expect((await f.forActor(f.alice).tasks.list(project.entityId)).length).toBe(before);
  await expect(
    executeAgentTool(f.db, { ...identity, userId: "bob" }, "list_projects", {}),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  await expect(
    executeAgentTool(f.db, { ...identity, organizationId: f.orgB }, "list_projects", {}),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});

test("message pages enforce time boundaries and bind cursors to filters", async () => {
  const { human, call } = await fixture();
  const channel = await human.createConversation({ kind: "channel", name: "pages" });
  for (const [body, createdAt] of [
    ["before", "2026-11-06T23:59:59Z"],
    ["start", "2026-11-07T00:00:00Z"],
    ["middle", "2026-11-07T12:00:00Z"],
    ["end", "2026-11-08T00:00:00Z"],
  ]) {
    const message = await human.sendMessage(channel.id, body!);
    await f.db
      .update(messagingMessages)
      .set({ createdAt: new Date(createdAt!) })
      .where(eq(messagingMessages.id, message.id));
  }
  const input = {
    conversationId: channel.id,
    since: "2026-11-07T00:00:00Z",
    until: "2026-11-08T00:00:00Z",
    limit: 1,
  };
  const first = mcpTools.list_messages.output.parse(await call("list_messages", input));
  expect(first.messages.items.map((item) => item.body)).toEqual(["middle"]);
  expect(first.messages.nextCursor).not.toBeNull();
  const second = mcpTools.list_messages.output.parse(
    await call("list_messages", { ...input, cursor: first.messages.nextCursor }),
  );
  expect(second.messages.items.map((item) => item.body)).toEqual(["start"]);
  expect(second.messages.nextCursor).toBeNull();
  await expect(
    call("list_messages", {
      ...input,
      since: "2026-11-06T00:00:00Z",
      cursor: first.messages.nextCursor,
    }),
  ).rejects.toThrow("cursor");
});
