import { registerDevice } from "../../core/devices/repository";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { agentRequests, agentToolRequests, messagingMessages, userAgents } from "../../schema";
import { ownerAgentWork } from "../../testing/agent-work";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { mcpFixture } from "../../testing/mcp";
import { rejection } from "../../testing/rejection";
import { dmTurn, routineTurn, threadTurn } from "../../testing/turns";
import { executeAgentTool } from "./execution";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";

const f = setupDatabase();

const messagesIn = (conversationId: string) =>
  f.db.select().from(messagingMessages).where(eq(messagingMessages.conversationId, conversationId));

const message = async (id: string) =>
  (await f.db.select().from(messagingMessages).where(eq(messagingMessages.id, id)))[0]!;

test("reply posts top level in a DM and in the thread of a thread turn, with its turn", async () => {
  const { agent, alice, dm, call, turn: contextOf } = await mcpFixture(f);
  const turn = dmTurn(dm.id);
  const sent = await call("reply", { requestId: crypto.randomUUID(), body: "Done" }, turn);
  const { turnId } = await contextOf(turn);
  expect(await message(sent.messageId)).toMatchObject({
    conversationId: dm.id,
    threadId: null,
    originTurnId: turnId,
    authorActorEntityId: agent.actorId,
  });
  const [receipt] = await f.db
    .select({ turnId: agentToolRequests.turnId, attempt: agentToolRequests.attempt })
    .from(agentToolRequests)
    .where(eq(agentToolRequests.tool, "reply"));
  expect(receipt).toEqual({ turnId, attempt: 1 });

  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  const root = await alice.sendMessage(channel.id, "Launch plan");
  const inThread = await call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Draft" },
    threadTurn(channel.id, root.id),
  );
  expect(inThread).toMatchObject({
    conversationId: channel.id,
    threadId: root.id,
    questionId: null,
  });
});

test("a background reply posts at once, in place or elsewhere", async () => {
  const { alice, dm, call } = await mcpFixture(f);
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  const background = dmTurn(dm.id, "unattended");
  const posted = await call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Elsewhere", to: { conversationId: channel.id } },
    background,
  );
  expect((await messagesIn(channel.id)).map((row) => row.id)).toEqual([posted.messageId]);
  expect(await f.db.select().from(agentRequests)).toEqual([]);

  const inPlace = await call("reply", { requestId: crypto.randomUUID(), body: "Done" }, background);
  expect(inPlace).toMatchObject({ conversationId: dm.id, threadId: null });

  // A routine turn has no source and publishes to its destination.
  const routine = routineTurn({ conversationId: channel.id, threadId: null });
  const sent = await call("reply", { requestId: crypto.randomUUID(), body: "Weekly" }, routine);
  expect(sent).toMatchObject({ conversationId: channel.id, threadId: null });

  // Interactive turns may choose another target.
  const elsewhere = await call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Posted here", to: { conversationId: channel.id } },
    dmTurn(dm.id),
  );
  expect(elsewhere.conversationId).toBe(channel.id);
});

test("a call cannot borrow another agent's turn", async () => {
  const { alice, dm, call, turn: contextOf } = await mcpFixture(f);
  const turn = dmTurn(dm.id);
  await call("reply", { requestId: crypto.randomUUID(), body: "Mine" }, turn);
  const other = await ownedAgent(f, "alice", "Writer");
  await alice.createConversation({ kind: "dm", agentIds: [other.agentId] });
  expect(
    await rejection(
      executeAgentTool(
        f.db,
        {
          userId: "alice",
          organizationId: f.orgA,
          actorEntityId: other.actorId,
          installationId: other.identity.installationId,
        },
        "reply",
        { requestId: crypto.randomUUID(), body: "Borrowed" },
        await contextOf(turn),
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
});

// Replies no longer wait, but proposals stored before that change can still be approved.
test("an approved stored post to a task discussion posts once, as the agent, with its turn", async () => {
  const { agent, dm, owner, propose, turn: contextOf } = await mcpFixture(f);
  const repos = f.forActor(f.alice);
  const project = await repos.projects.create({ name: "Task discussion" });
  const task = await repos.tasks.create({ projectEntityId: project.entityId, title: "Follow up" });
  const conversationId = await repos.tasks.ensureDiscussion(task.entityId);
  const background = dmTurn(dm.id, "unattended");
  const requestId = await propose(
    "reply",
    { requestId: crypto.randomUUID(), body: "Progress to share", to: { conversationId } },
    background,
  );
  expect(await messagesIn(conversationId)).toEqual([]);
  const { outcome } = (await (await ownerAgentWork(f.db, owner)).approveProposal(requestId)).result;
  const posted = await messagesIn(conversationId);
  expect(posted.map((row) => [row.body, row.authorActorEntityId, row.originTurnId])).toEqual([
    ["Progress to share", agent.actorId, (await contextOf(background)).turnId],
  ]);
  expect(outcome).toMatchObject({
    status: "executed",
    receipt: { kind: "message", id: posted[0]!.id, conversationId, threadId: null },
    result: { messageId: posted[0]!.id, conversationId, threadId: null, questionId: null },
  });
});

test("background turns cannot ask: reply.ask is rejected before anything posts", async () => {
  const { dm, call } = await mcpFixture(f);
  expect(
    await rejection(
      call(
        "reply",
        { requestId: crypto.randomUUID(), body: "Should I?", ask: { question: "Should I?" } },
        dmTurn(dm.id, "unattended"),
      ),
    ),
  ).toBeInstanceOf(ValidationError);
  expect(await messagesIn(dm.id)).toEqual([]);
  expect(await f.db.select().from(agentRequests)).toEqual([]);
});

test("only a turn leased by the agent's home desktop, called from that desktop, runs any tool", async () => {
  const { agent, dm, call, pending } = await mcpFixture(f);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const task = await f.forActor(f.alice).tasks.create({
    projectEntityId: project.entityId,
    title: "Keep",
  });
  const desktop = await registerDevice(f.db, "alice", {
    installationId: crypto.randomUUID(),
    name: "Desktop",
    platform: "linux",
  });
  await f.db
    .update(userAgents)
    .set({ homeDeviceId: desktop.id })
    .where(eq(userAgents.id, agent.agentId));
  // The old desktop's lease, called from the old desktop, the new one, an unknown one, or none.
  const oldDesktop = { ...dmTurn(dm.id), installationId: agent.identity.installationId };
  const newCaller = { ...dmTurn(dm.id), installationId: desktop.installationId };
  const unknown = { ...dmTurn(dm.id), installationId: crypto.randomUUID() };
  const withoutDevice = { ...dmTurn(dm.id), installationId: undefined };
  for (const turn of [oldDesktop, newCaller, unknown, withoutDevice]) {
    expect(
      await rejection(call("reply", { requestId: crypto.randomUUID(), body: "Stale" }, turn)),
    ).toBeInstanceOf(AccessDeniedError);
    // A call that would wait for approval is refused before it is stored.
    expect(
      await rejection(
        pending("delete_task", { requestId: crypto.randomUUID(), taskId: task.entityId }, turn),
      ),
    ).toBeInstanceOf(AccessDeniedError);
    // Reads need a live turn of the home desktop too.
    expect(await rejection(call("list_projects", {}, turn))).toBeInstanceOf(AccessDeniedError);
  }
  expect(await messagesIn(dm.id)).toEqual([]);
  expect(await f.db.select().from(agentRequests)).toEqual([]);

  // A turn the new home desktop holds publishes.
  const home = {
    ...dmTurn(dm.id),
    installationId: desktop.installationId,
    leaseDeviceId: desktop.id,
  };
  await call("reply", { requestId: crypto.randomUUID(), body: "Moved" }, home);
  expect((await messagesIn(dm.id)).map((row) => row.body)).toEqual(["Moved"]);
  expect((await call("list_projects", {}, home)).items).toHaveLength(1);
});
// writeGate's unit test covers each tool and turn kind; this checks the gate runs before writes.
test("a quiet handoff turn cannot publish but can read", async () => {
  const { dm, call } = await mcpFixture(f);
  await f.forActor(f.alice).projects.create({ name: "Work" });
  const handoff = { ...dmTurn(dm.id, "unattended"), handoff: true };
  expect(
    await rejection(
      call("reply", { requestId: crypto.randomUUID(), body: "Handing off" }, handoff),
    ),
  ).toBeInstanceOf(ValidationError);
  expect(await messagesIn(dm.id)).toEqual([]);
  expect(await f.db.select().from(agentRequests)).toEqual([]);
  // Reading stays allowed, so the agent can gather its notes.
  expect((await call("list_projects", {}, handoff)).items).toHaveLength(1);
});

test("reply.ask anchors one async question to the reply", async () => {
  const { dm, call, turn: contextOf } = await mcpFixture(f);
  const turn = dmTurn(dm.id);
  const sent = await call(
    "reply",
    {
      requestId: crypto.randomUUID(),
      body: "One question",
      ask: { question: "Which plan?", options: [{ label: "A" }, { label: "B" }] },
    },
    turn,
  );
  const [request] = await f.db
    .select()
    .from(agentRequests)
    .where(eq(agentRequests.id, sent.questionId!));
  expect(request).toMatchObject({
    kind: "question",
    mode: "async",
    status: "pending",
    turnId: (await contextOf(turn)).turnId,
    sessionKey: turn.key,
    anchorMessageId: sent.messageId,
    conversationId: dm.id,
  });
  expect(request!.payload).toMatchObject({
    type: "questions",
    questions: [{ question: "Which plan?", multiSelect: false, allowCustom: true }],
  });
});

test("update_task requires a requestId and replays the same change", async () => {
  const { call, dm } = await mcpFixture(f);
  const turn = dmTurn(dm.id);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const task = await call(
    "create_task",
    { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Task" },
    turn,
  );
  expect(
    await rejection(
      call("update_task", { taskId: task.id, changes: { status: "completed" } }, turn),
    ),
  ).toBeInstanceOf(ZodError);
  const input = { requestId: crypto.randomUUID(), taskId: task.id, changes: { priority: "high" } };
  const updated = await call("update_task", input, turn);
  // Someone changes the task after the agent did; a retry must not apply the change again.
  await f.forActor(f.alice).tasks.update(task.id, { priority: "low" });
  expect(await call("update_task", input, turn)).toEqual(updated);
  expect((await call("get_task", { taskId: task.id }, turn)).priority).toBe("low");
  expect(
    await rejection(call("update_task", { ...input, changes: { priority: "urgent" } }, turn)),
  ).toBeInstanceOf(ConflictError);
});

test("a call that waits stores the exact call once", async () => {
  const { dm, pending } = await mcpFixture(f);
  const turn = dmTurn(dm.id);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const tasks = f.forActor(f.alice).tasks;
  const task = await tasks.create({ projectEntityId: project.entityId, title: "Plan" });
  const other = await tasks.create({ projectEntityId: project.entityId, title: "Other" });
  const input = { requestId: crypto.randomUUID(), taskId: task.entityId };
  const requestId = await pending("delete_task", input, turn);
  const requests = await f.db.select().from(agentRequests);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    id: requestId,
    kind: "proposal",
    mode: "async",
    proposedAction: { tool: "delete_task", input: { taskId: task.entityId } },
    payload: { type: "proposal", summary: "Delete task" },
    conversationId: dm.id,
  });
  expect(requests[0]!.actionHash).toMatch(/^[0-9a-f]{64}$/);
  // The same requestId with other input is a conflict, not a new proposal.
  expect(
    await rejection(pending("delete_task", { ...input, taskId: other.entityId }, turn)),
  ).toBeInstanceOf(ConflictError);
});
