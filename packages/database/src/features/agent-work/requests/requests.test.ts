import { staleProposalError } from "@substrate/contracts/agent-work";

import { RepositoryContext, type PermissionLevel } from "../../../core/repository-context";
import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import {
  agentRequests,
  agentSessions,
  agentWorkItems,
  messagingConversations,
  messagingMessages,
  tasks,
} from "../../../schema";
import { agentWorkFixture, deviceAgentWork, ownerAgentWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { dmTurn, threadTurn } from "../../../testing/turns";
import { expect, spyOn, test } from "bun:test";
import { eq, sql } from "drizzle-orm";

const f = setupDatabase();

const approval = {
  type: "approval" as const,
  title: "Allow Bash?",
  detail: "rm -rf build",
  options: [
    { id: "allow", label: "Approve", style: "approve" as const },
    { id: "deny", label: "Decline", style: "deny" as const },
  ],
};

const wakesFor = (requestId: string) =>
  f.db
    .select({ source: agentWorkItems.source, sessionKey: agentSessions.key })
    .from(agentWorkItems)
    .innerJoin(agentSessions, eq(agentSessions.id, agentWorkItems.sessionId))
    .where(sql`${agentWorkItems.sourceRef}->>'requestId' = ${requestId}`);

async function blocking() {
  const fixture = await agentWorkFixture(f);
  const turn = dmTurn(fixture.dm.id);
  const input = {
    turnId: (await fixture.turn(turn)).turnId,
    epoch: 0,
    kind: "permission" as const,
    mode: "blocking" as const,
    nativeRequestId: "native-1",
    conversationId: fixture.dm.id,
    payload: approval,
  };
  const device = await deviceAgentWork(f.db, fixture.agent.identity);
  const work = await ownerAgentWork(f.db, fixture.owner);
  const request = (await device.openRequest(input)).result;
  return { ...fixture, device, work, input, request };
}

test("a blocking request opens once, the first answer wins, and the home device delivers it", async () => {
  const { agent, device, work, input, request } = await blocking();
  expect((await device.openRequest(input)).result).toEqual(request);

  expect(
    await rejection(work.respondToRequest(request.id, { type: "approval", optionId: "sudo" })),
  ).toBeInstanceOf(ValidationError);
  await work.respondToRequest(request.id, { type: "approval", optionId: "deny" });
  expect(
    await rejection(work.respondToRequest(request.id, { type: "approval", optionId: "allow" })),
  ).toBeInstanceOf(ConflictError);
  expect(await wakesFor(request.id)).toEqual([]);

  expect(await device.requestAnswers()).toEqual([
    {
      requestId: request.id,
      userAgentId: agent.agentId,
      turnId: input.turnId,
      nativeRequestId: "native-1",
      response: { type: "approval", optionId: "deny" },
    },
  ]);
  const closes = [
    (await device.closeRequest(request.id, "delivered")).result,
    (await device.closeRequest(request.id, "delivered")).result,
  ];
  expect(closes).toEqual([{ changed: true }, { changed: false }]);
  expect(await device.requestAnswers()).toEqual([]);
});

test("an answer whose callback went away is undelivered and kept; an unanswered one is orphaned", async () => {
  const { device, work, dm, input, request } = await blocking();
  await work.respondToRequest(request.id, { type: "approval", optionId: "allow" });
  expect((await device.closeRequest(request.id, "orphaned")).result).toEqual({
    changed: true,
  });
  const [answered] = await work.listConversationRequests(dm.id);
  expect(answered).toMatchObject({
    id: request.id,
    status: "undelivered",
    response: { type: "approval", optionId: "allow" },
  });
  expect(await device.requestAnswers()).toEqual([]);

  const open = (await device.openRequest({ ...input, nativeRequestId: "native-2" })).result;
  expect((await device.closeRequest(open.id, "orphaned")).result).toEqual({
    changed: true,
  });
  const [row] = await f.db
    .select({ status: agentRequests.status })
    .from(agentRequests)
    .where(eq(agentRequests.id, open.id));
  expect(row).toEqual({ status: "orphaned" });
});

test("an expired blocking request cannot be answered", async () => {
  const { work, request } = await blocking();
  await f.db
    .update(agentRequests)
    .set({ expiresAt: sql`now() - interval '1 second'` })
    .where(eq(agentRequests.id, request.id));
  expect(
    await rejection(work.respondToRequest(request.id, { type: "approval", optionId: "allow" })),
  ).toBeInstanceOf(ConflictError);
});

test("other people cannot see or answer someone's requests, or act as their device", async () => {
  const { dm, input, request } = await blocking();
  const bob = { userId: "bob", organizationId: f.orgA };
  const bobWork = await ownerAgentWork(f.db, bob);
  expect(
    await rejection(bobWork.respondToRequest(request.id, { type: "approval", optionId: "allow" })),
  ).toBeInstanceOf(AccessDeniedError);
  expect((await bobWork.listNeedsYou()).requests).toEqual([]);
  expect(await bobWork.listConversationRequests(dm.id)).toEqual([]);
  const bobDevice = { ...bob, installationId: crypto.randomUUID() };
  expect(
    await rejection(deviceAgentWork(f.db, bobDevice).then((device) => device.openRequest(input))),
  ).toBeInstanceOf(AccessDeniedError);
});

test("an async question's answer wakes the agent exactly once in the question's session", async () => {
  const { dm, owner, call } = await agentWorkFixture(f);
  const turn = dmTurn(dm.id);
  const reply = await call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Which week?", ask: { question: "Which week?" } },
    turn,
  );
  const work = await ownerAgentWork(f.db, owner);
  const [view] = (await work.listNeedsYou()).requests;
  expect(view).toMatchObject({
    id: reply.questionId,
    kind: "question",
    mode: "async",
    place: { access: "visible", conversationId: dm.id, anchorMessageId: reply.messageId },
  });
  const answer = { type: "questions" as const, answers: { answer: ["Next week"] } };
  await work.respondToRequest(reply.questionId!, answer);
  expect(await rejection(work.respondToRequest(reply.questionId!, answer))).toBeInstanceOf(
    ConflictError,
  );
  expect(await wakesFor(reply.questionId!)).toEqual([{ source: "answer", sessionKey: turn.key }]);
  expect((await work.listNeedsYou()).requests).toEqual([]);
});

const reply = (conversationId: string, body: string) => ({
  requestId: crypto.randomUUID(),
  body,
  to: { conversationId },
});

test("approving a proposal runs the exact call once, even when approved twice at once", async () => {
  const { dm, owner, alice, propose, turn: contextOf } = await agentWorkFixture(f);
  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  const turn = dmTurn(dm.id, "unattended");
  const proposalId = await propose("reply", reply(channel.id, "Weekly summary"), turn);
  const work = await ownerAgentWork(f.db, owner);
  const results = await Promise.allSettled([
    work.approveProposal(proposalId),
    work.approveProposal(proposalId),
  ]);
  const approved = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value.result] : [],
  );
  expect(approved).toHaveLength(1);
  expect(results.find((result) => result.status === "rejected")?.reason).toBeInstanceOf(
    ConflictError,
  );
  const posted = await f.db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.conversationId, channel.id));
  expect(posted.map((message) => [message.body, message.originTurnId])).toEqual([
    ["Weekly summary", (await contextOf(turn)).turnId],
  ]);
  expect(approved[0]!.outcome).toEqual({
    status: "executed",
    receipt: { kind: "message", id: posted[0]!.id, conversationId: channel.id, threadId: null },
    result: {
      messageId: posted[0]!.id,
      conversationId: channel.id,
      threadId: null,
      questionId: null,
      createdAt: posted[0]!.createdAt.toISOString(),
    },
  });
  expect(await wakesFor(proposalId)).toEqual([{ source: "approval_result", sessionKey: turn.key }]);
});

test("a proposal stores the call without its requestId, under the tool's title", async () => {
  const { dm, propose } = await agentWorkFixture(f);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const proposalId = await propose(
    "create_task",
    { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Checklist" },
    dmTurn(dm.id, "unattended"),
  );
  const [row] = await f.db.select().from(agentRequests).where(eq(agentRequests.id, proposalId));
  expect(row).toMatchObject({
    kind: "proposal",
    mode: "async",
    payload: { type: "proposal", summary: "Create task" },
    proposedAction: {
      tool: "create_task",
      input: { projectId: project.entityId, title: "Checklist" },
    },
    targetBasis: { entities: { [project.entityId]: expect.any(String) }, conversations: {} },
  });
});

test("an executed proposal is listed in the conversation it posted to, for its owner only", async () => {
  const { dm, owner, alice, bob, propose } = await agentWorkFixture(f);
  const target = await bob.createConversation({
    kind: "channel",
    name: "team",
    private: true,
    emails: ["alice@example.com"],
  });
  const proposalId = await propose(
    "reply",
    reply(target.id, "Update"),
    dmTurn(dm.id, "unattended"),
  );
  const work = await ownerAgentWork(f.db, owner);
  expect(await work.listConversationRequests(target.id)).toEqual([]);
  const { outcome } = (await work.approveProposal(proposalId)).result;
  const listed = await work.listConversationRequests(target.id);
  expect(listed.map((view) => [view.id, view.proposal?.outcome])).toEqual([[proposalId, outcome]]);
  expect(listed[0]!.place).toMatchObject({ access: "visible", conversationId: dm.id });
  expect((await work.conversationWork(target.id)).requests).toEqual(listed);

  await bob.sendMessage(target.id, "Thanks");
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  expect(await bobWork.listConversationRequests(target.id)).toEqual([]);
  await alice.leaveConversation(target.id);
  expect(await work.listConversationRequests(target.id)).toEqual([]);
});

test("a task proposal's receipt names the task's project", async () => {
  const { dm, owner, propose } = await agentWorkFixture(f);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const proposalId = await propose(
    "create_task",
    { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Checklist" },
    dmTurn(dm.id, "unattended"),
  );
  const { outcome } = (await (await ownerAgentWork(f.db, owner)).approveProposal(proposalId))
    .result;
  const [task] = await f.db.select().from(tasks).where(eq(tasks.projectEntityId, project.entityId));
  expect(outcome).toMatchObject({
    status: "executed",
    receipt: { kind: "task", id: task!.entityId, projectId: project.entityId },
  });
});

test("a proposal cannot name a record the agent cannot read", async () => {
  const { dm, alice, bob, propose } = await agentWorkFixture(f);
  const turn = dmTurn(dm.id, "unattended");
  const outside = f.forActor(f.outsider, f.orgB);
  const hidden = await outside.projects.create({ name: "Other org" });
  const secret = await bob.createConversation({
    kind: "channel",
    name: "bob",
    private: true,
    emails: ["alice@example.com"],
  });
  await alice.leaveConversation(secret.id);
  const before = await f.db.select().from(agentRequests);
  expect(
    await rejection(
      propose(
        "create_task",
        { requestId: crypto.randomUUID(), projectId: hidden.entityId, title: "Peek" },
        turn,
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await rejection(propose("reply", reply(secret.id, "Hi"), turn))).toBeInstanceOf(
    AccessDeniedError,
  );
  const own = await f.forActor(f.alice).projects.create({ name: "Work" });
  const task = await f.forActor(f.alice).tasks.create({
    projectEntityId: own.entityId,
    title: "Draft",
  });
  const hiddenTask = await outside.tasks.create({
    projectEntityId: hidden.entityId,
    title: "Secret",
  });
  expect(
    await rejection(
      propose(
        "add_task_link",
        {
          requestId: crypto.randomUUID(),
          taskId: task.entityId,
          relation: "blocks",
          otherTaskId: hiddenTask.entityId,
        },
        turn,
      ),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  expect(await f.db.select().from(agentRequests)).toEqual(before);
});

test("approval checks access again and records a failure; decline runs nothing", async () => {
  const { dm, owner, alice, bob, propose } = await agentWorkFixture(f);
  const shared = await bob.createConversation({
    kind: "channel",
    name: "bob",
    private: true,
    emails: ["alice@example.com"],
  });
  const turn = dmTurn(dm.id, "unattended");
  const post = await propose("reply", reply(shared.id, "Hello"), turn);
  await alice.leaveConversation(shared.id);
  const work = await ownerAgentWork(f.db, owner);
  expect((await work.approveProposal(post)).result.outcome).toEqual({
    status: "failed",
    error: "The target no longer exists or is no longer available.",
  });
  expect(
    await f.db
      .select()
      .from(messagingMessages)
      .where(eq(messagingMessages.conversationId, shared.id)),
  ).toEqual([]);

  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const create = await propose(
    "create_task",
    { requestId: crypto.randomUUID(), projectId: project.entityId, title: "Write checklist" },
    turn,
  );
  expect((await work.declineProposal(create)).result).toEqual({
    status: "resolved",
    outcome: { status: "declined" },
  });
  expect(await rejection(work.approveProposal(create))).toBeInstanceOf(ConflictError);
  expect(
    await f.db.select().from(tasks).where(eq(tasks.projectEntityId, project.entityId)),
  ).toEqual([]);
  expect(await wakesFor(create)).toEqual([{ source: "approval_result", sessionKey: turn.key }]);
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  expect(await rejection(bobWork.approveProposal(post))).toBeInstanceOf(AccessDeniedError);
});

test("after the owner leaves, a request is a placeholder without IDs, text or proposal", async () => {
  const { owner, alice, bob, dm, call, propose } = await agentWorkFixture(f);
  const shared = await bob.createConversation({
    kind: "channel",
    name: "secret-plans",
    private: true,
    emails: ["alice@example.com"],
  });
  const root = await bob.sendMessage(shared.id, "Root of the secret thread");
  const target = await bob.createConversation({
    kind: "channel",
    name: "secret-target",
    private: true,
    emails: ["alice@example.com"],
  });
  const turn = threadTurn(shared.id, root.id);
  const asked = await call(
    "reply",
    {
      requestId: crypto.randomUUID(),
      body: "Secret question body",
      ask: { question: "Secret question?", options: [{ label: "Secret option" }] },
    },
    turn,
  );
  const proposed = await propose("reply", reply(target.id, "Secret action body"), {
    ...turn,
    kind: "unattended",
  });
  const fromDm = await propose(
    "reply",
    reply(target.id, "Secret target body"),
    dmTurn(dm.id, "unattended"),
  );
  await alice.leaveConversation(shared.id);
  await alice.leaveConversation(target.id);

  const views = (await (await ownerAgentWork(f.db, owner)).listNeedsYou()).requests;
  const byId = new Map(views.map((view) => [view.id, view]));
  for (const id of [asked.questionId!, proposed]) {
    expect(byId.get(id)!.place).toEqual({ access: "hidden" });
    for (const field of ["sessionKey", "payload", "response", "proposal"])
      expect(byId.get(id)).not.toHaveProperty(field);
  }
  expect(byId.get(fromDm)).toMatchObject({
    place: { access: "visible", conversationId: dm.id },
    payload: { type: "proposal", summary: "Reply" },
    proposal: null,
  });
  const text = JSON.stringify(views);
  for (const secret of ["secret", "Secret", shared.id, root.id, target.id, asked.messageId])
    expect(text).not.toContain(secret);
});

test("an approval runs only while the target is as it was proposed", async () => {
  const { dm, owner, alice, propose } = await agentWorkFixture(f);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const task = await f.forActor(f.alice).tasks.create({
    projectEntityId: project.entityId,
    title: "Draft",
  });
  const turn = dmTurn(dm.id, "unattended");
  const complete = () =>
    propose(
      "update_task",
      { requestId: crypto.randomUUID(), taskId: task.entityId, changes: { status: "completed" } },
      turn,
    );
  const update = await complete();
  await f.forActor(f.alice).tasks.update(task.entityId, { priority: "high" });
  const stale = { status: "failed" as const, error: staleProposalError };
  const work = await ownerAgentWork(f.db, owner);
  expect((await work.approveProposal(update)).result).toEqual({
    status: "failed",
    outcome: stale,
  });
  const [row] = await f.db.select().from(tasks).where(eq(tasks.entityId, task.entityId));
  expect(row).toMatchObject({ status: "not_started", priority: "high" });
  expect(await wakesFor(update)).toEqual([{ source: "approval_result", sessionKey: turn.key }]);

  const channel = await alice.createConversation({ kind: "channel", name: "general" });
  const post = await propose("reply", reply(channel.id, "Hello"), turn);
  await f.db
    .update(messagingConversations)
    .set({ private: true })
    .where(eq(messagingConversations.id, channel.id));
  expect((await work.approveProposal(post)).result.outcome).toEqual(stale);
  expect(
    await f.db
      .select()
      .from(messagingMessages)
      .where(eq(messagingMessages.conversationId, channel.id)),
  ).toEqual([]);

  const fresh = await complete();
  expect((await work.approveProposal(fresh)).result.status).toBe("executed");
  const [done] = await f.db.select().from(tasks).where(eq(tasks.entityId, task.entityId));
  expect(done!.status).toBe("completed");
});

test("an approval fails when the target changes after its last check, before its write", async () => {
  const { dm, owner, propose } = await agentWorkFixture(f);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const task = await f.forActor(f.alice).tasks.create({
    projectEntityId: project.entityId,
    title: "Draft",
  });
  const update = await propose(
    "update_task",
    { requestId: crypto.randomUUID(), taskId: task.entityId, changes: { title: "Done" } },
    dmTurn(dm.id, "unattended"),
  );
  // SAFETY: the descriptor holds the real method, which the spy below replaces.
  const read = Object.getOwnPropertyDescriptor(RepositoryContext.prototype, "requireAccess")!
    .value as RepositoryContext["requireAccess"];
  let armed = true;
  const spy = spyOn(RepositoryContext.prototype, "requireAccess").mockImplementation(
    // SAFETY: the wrapper returns what the real method returns for the same arguments.
    async function (this: RepositoryContext, entityId: string, minimum: PermissionLevel) {
      const access = await read.call(this, entityId, minimum);
      if (armed && entityId === task.entityId) {
        armed = false;
        await f.forActor(f.alice).tasks.update(task.entityId, { priority: "high" });
      }
      return access;
    } as typeof read,
  );
  try {
    const { outcome } = (await (await ownerAgentWork(f.db, owner)).approveProposal(update)).result;
    expect(armed).toBe(false);
    expect(outcome).toEqual({ status: "failed", error: staleProposalError });
  } finally {
    spy.mockRestore();
  }
  const [row] = await f.db.select().from(tasks).where(eq(tasks.entityId, task.entityId));
  expect(row).toMatchObject({ title: "Draft", priority: "high" });
});

test("a request in a conversation the owner left shows no name or ID", async () => {
  const { alice, bob, device, work, input } = await blocking();
  const shared = await bob.createConversation({
    kind: "channel",
    name: "secret-plans",
    private: true,
    emails: ["alice@example.com"],
  });
  const hidden = (
    await device.openRequest({
      ...input,
      nativeRequestId: "native-2",
      conversationId: shared.id,
    })
  ).result;
  await alice.leaveConversation(shared.id);
  const views = (await work.listNeedsYou()).requests;
  expect(views.find((view) => view.id === hidden.id)?.place).toEqual({ access: "hidden" });
  expect(JSON.stringify(views)).not.toContain("secret-plans");
  expect(await work.listConversationRequests(shared.id)).toEqual([]);
});
