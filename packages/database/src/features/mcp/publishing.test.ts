import { registerDevice } from "../../core/devices/repository";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { agentRequests, agentToolRequests, messagingMessages, userAgents } from "../../schema";
import { agentWorkFixture, dmTurn, threadTurn } from "../../testing/agent-work";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { executeAgentTool } from "./service";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous. */
const f = setupDatabase();

const message = async (id: string) =>
  (await f.db.select().from(messagingMessages).where(eq(messagingMessages.id, id)))[0]!;

test("reply posts top level in a DM and in the thread of a thread turn, with its turn", async () => {
  const { agent, alice, dm, call } = await agentWorkFixture(f);
  const turn = dmTurn(dm.id);
  const sent = await call("reply", { requestId: crypto.randomUUID(), body: "Done" }, turn);
  expect(await message(sent.messageId)).toMatchObject({
    conversationId: dm.id,
    threadId: null,
    originTurnId: turn.turnId,
    authorActorEntityId: agent.actorId,
  });
  const [receipt] = await f.db
    .select({ turnId: agentToolRequests.turnId, attempt: agentToolRequests.attempt })
    .from(agentToolRequests)
    .where(eq(agentToolRequests.tool, "reply"));
  expect(receipt).toEqual({ turnId: turn.turnId, attempt: 1 });

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

test("background turns post only to their own place and propose everything else", async () => {
  const { alice, dm, call } = await agentWorkFixture(f);
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  const background = dmTurn(dm.id, "unattended");
  await expect(
    call(
      "reply",
      { requestId: crypto.randomUUID(), body: "Elsewhere", to: { conversationId: channel.id } },
      background,
    ),
  ).rejects.toThrow("Use propose for this action");
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  await expect(
    call(
      "create_task",
      { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Task" },
      background,
    ),
  ).rejects.toBeInstanceOf(ValidationError);

  // A routine turn has no source and publishes to its destination.
  const routine = {
    turnId: crypto.randomUUID(),
    attempt: 1,
    sessionKey: `routine:${crypto.randomUUID()}`,
    origin: null,
    kind: "unattended" as const,
    destination: { conversationId: channel.id, threadId: null },
  };
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

test("the turn must match its session and cannot borrow another agent's turn", async () => {
  const { alice, dm, call } = await agentWorkFixture(f);
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  await expect(
    call(
      "reply",
      { requestId: crypto.randomUUID(), body: "x" },
      { ...dmTurn(dm.id), origin: { conversationId: channel.id, threadId: null } },
    ),
  ).rejects.toBeInstanceOf(ValidationError);

  const turn = dmTurn(dm.id);
  await call("reply", { requestId: crypto.randomUUID(), body: "Mine" }, turn);
  const other = await ownedAgent(f, "alice", "Writer");
  const otherDm = await alice.createConversation({ kind: "dm", agentIds: [other.agentId] });
  await expect(
    executeAgentTool(
      f.db,
      { userId: "alice", organizationId: f.orgA, actorEntityId: other.actorId },
      "reply",
      { requestId: crypto.randomUUID(), body: "Borrowed" },
      {
        ...turn,
        sessionKey: `dm:${otherDm.id}`,
        origin: { conversationId: otherDm.id, threadId: null },
        installationId: other.identity.installationId,
      },
    ),
  ).rejects.toBeInstanceOf(AccessDeniedError);
});

const messagesIn = (conversationId: string) =>
  f.db.select().from(messagingMessages).where(eq(messagingMessages.conversationId, conversationId));

test("background turns cannot ask: reply.ask is rejected before anything posts", async () => {
  const { dm, call } = await agentWorkFixture(f);
  await expect(
    call(
      "reply",
      { requestId: crypto.randomUUID(), body: "Should I?", ask: { question: "Should I?" } },
      dmTurn(dm.id, "unattended"),
    ),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(await messagesIn(dm.id)).toEqual([]);
  expect(await f.db.select().from(agentRequests)).toEqual([]);
});

test("only the agent's home desktop can write; a moved agent's old desktop can only read", async () => {
  const { agent, dm, call } = await agentWorkFixture(f);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const desktop = await registerDevice(f.db, "alice", {
    installationId: crypto.randomUUID(),
    name: "Desktop",
    platform: "linux",
  });
  await f.db
    .update(userAgents)
    .set({ homeDeviceId: desktop.id })
    .where(eq(userAgents.id, agent.agentId));
  const oldDesktop = { ...dmTurn(dm.id), installationId: agent.identity.installationId };
  const unknown = { ...dmTurn(dm.id), installationId: crypto.randomUUID() };
  const withoutDevice = { ...dmTurn(dm.id), installationId: undefined };
  for (const turn of [oldDesktop, unknown, withoutDevice]) {
    await expect(
      call("reply", { requestId: crypto.randomUUID(), body: "Stale" }, turn),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      call(
        "propose",
        {
          requestId: crypto.randomUUID(),
          summary: "Track",
          action: { type: "create_task", input: { projectId: project.entityId, title: "Task" } },
        },
        turn,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
    await expect(
      call(
        "create_task",
        { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Task" },
        turn,
      ),
    ).rejects.toBeInstanceOf(AccessDeniedError);
  }
  expect(await messagesIn(dm.id)).toEqual([]);
  expect(await f.db.select().from(agentRequests)).toEqual([]);
  expect((await call("list_projects", {}, oldDesktop)).items).toHaveLength(1);

  // The new home desktop publishes.
  const home = { ...dmTurn(dm.id), installationId: desktop.installationId };
  await call("reply", { requestId: crypto.randomUUID(), body: "Moved" }, home);
  expect((await messagesIn(dm.id)).map((row) => row.body)).toEqual(["Moved"]);
});

test("a quiet handoff turn cannot publish, propose or write", async () => {
  const { dm, call } = await agentWorkFixture(f);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const handoff = { ...dmTurn(dm.id, "unattended"), purpose: "handoff" as const };
  await expect(
    call("reply", { requestId: crypto.randomUUID(), body: "Handing off" }, handoff),
  ).rejects.toBeInstanceOf(ValidationError);
  await expect(
    call(
      "propose",
      {
        requestId: crypto.randomUUID(),
        summary: "Track",
        action: { type: "create_task", input: { projectId: project.entityId, title: "Task" } },
      },
      handoff,
    ),
  ).rejects.toBeInstanceOf(ValidationError);
  // Even an interactive-looking handoff is quiet.
  await expect(
    call(
      "create_task",
      { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Task" },
      { ...dmTurn(dm.id), purpose: "handoff" },
    ),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(await messagesIn(dm.id)).toEqual([]);
  expect(await f.db.select().from(agentRequests)).toEqual([]);
  // Reading stays allowed, so the agent can gather its notes.
  expect((await call("list_projects", {}, handoff)).items).toHaveLength(1);
});

test("reply.ask anchors one async question to the reply", async () => {
  const { dm, call } = await agentWorkFixture(f);
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
    turnId: turn.turnId,
    sessionKey: turn.sessionKey,
    anchorMessageId: sent.messageId,
    conversationId: dm.id,
  });
  expect(request!.payload).toMatchObject({
    type: "questions",
    questions: [{ question: "Which plan?", multiSelect: false, allowCustom: true }],
  });
});

test("update_task requires a requestId and replays the same change", async () => {
  const { call, dm } = await agentWorkFixture(f);
  const turn = dmTurn(dm.id);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const task = await call(
    "create_task",
    { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Task" },
    turn,
  );
  await expect(
    call("update_task", { taskId: task.id, changes: { status: "completed" } }, turn),
  ).rejects.toBeInstanceOf(ZodError);
  const input = { requestId: crypto.randomUUID(), taskId: task.id, changes: { priority: "high" } };
  const updated = await call("update_task", input, turn);
  // Someone changes the task after the agent did; a retry must not apply the change again.
  await f.forActor(f.alice).tasks.update(task.id, { priority: "low" });
  expect(await call("update_task", input, turn)).toEqual(updated);
  expect((await call("get_task", { taskId: task.id }, turn)).priority).toBe("low");
  await expect(
    call("update_task", { ...input, changes: { priority: "urgent" } }, turn),
  ).rejects.toBeInstanceOf(ConflictError);
});

test("propose checks the action's target now and stores the exact action", async () => {
  const { bob, dm, call } = await agentWorkFixture(f);
  const hidden = await bob.createConversation({ kind: "channel", name: "bob", private: true });
  const turn = dmTurn(dm.id, "unattended");
  await expect(
    call(
      "propose",
      {
        requestId: crypto.randomUUID(),
        summary: "Post",
        action: { type: "reply_elsewhere", input: { conversationId: hidden.id, body: "Hi" } },
      },
      turn,
    ),
  ).rejects.toBeInstanceOf(AccessDeniedError);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const action = { type: "create_task", input: { projectId: project.entityId, title: "Plan" } };
  const { proposalId } = await call(
    "propose",
    { requestId: crypto.randomUUID(), summary: "Create the plan task", action },
    turn,
  );
  const [request] = await f.db.select().from(agentRequests).where(eq(agentRequests.id, proposalId));
  expect(request).toMatchObject({
    kind: "proposal",
    mode: "async",
    proposedAction: action,
    payload: { type: "proposal", summary: "Create the plan task" },
    conversationId: dm.id,
  });
  expect(request!.actionHash).toMatch(/^[0-9a-f]{64}$/);
});
