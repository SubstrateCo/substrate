import { AccessDeniedError, ConflictError, ValidationError } from "../../../errors";
import { agentRequests, agentWakes } from "../../../schema";
import {
  agentWorkFixture,
  deviceAgentWork,
  dmTurn,
  ownerAgentWork,
  threadTurn,
} from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { rejection } from "../../../testing/rejection";
import { expect, test } from "bun:test";
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
    .select({ source: agentWakes.source, sessionKey: agentWakes.sessionKey })
    .from(agentWakes)
    .where(sql`${agentWakes.sourceRef}->>'requestId' = ${requestId}`);

async function blocking() {
  const fixture = await agentWorkFixture(f);
  const turn = dmTurn(fixture.dm.id);
  const input = {
    userAgentId: fixture.agent.agentId,
    sessionKey: turn.sessionKey,
    turnId: turn.turnId,
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
  // A blocking answer goes to the waiting callback, not to a new turn.
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
  expect(await wakesFor(reply.questionId!)).toEqual([
    { source: "answer", sessionKey: turn.sessionKey },
  ]);
  expect((await work.listNeedsYou()).requests).toEqual([]);
});

test("after the owner leaves, a request is a placeholder without IDs or text", async () => {
  const { owner, alice, bob, dm, call } = await agentWorkFixture(f);
  const shared = await bob.createConversation({
    kind: "channel",
    name: "secret-plans",
    private: true,
    emails: ["alice@example.com"],
  });
  const root = await bob.sendMessage(shared.id, "Root of the secret thread");
  const asked = await call(
    "reply",
    {
      requestId: crypto.randomUUID(),
      body: "Secret question body",
      ask: { question: "Secret question?", options: [{ label: "Secret option" }] },
    },
    threadTurn(shared.id, root.id),
  );
  // In the DM, which stays visible.
  const fromDm = await call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Which week?", ask: { question: "Which week?" } },
    dmTurn(dm.id),
  );
  await alice.leaveConversation(shared.id);

  const views = (await (await ownerAgentWork(f.db, owner)).listNeedsYou()).requests;
  const byId = new Map(views.map((view) => [view.id, view]));
  expect(byId.get(asked.questionId!)!.place).toEqual({ access: "hidden" });
  for (const field of ["sessionKey", "payload", "response"])
    expect(byId.get(asked.questionId!)).not.toHaveProperty(field);
  expect(byId.get(fromDm.questionId!)).toMatchObject({
    place: { access: "visible", conversationId: dm.id },
    payload: { type: "questions" },
  });
  const text = JSON.stringify(views);
  for (const secret of ["secret", "Secret", shared.id, root.id, asked.messageId])
    expect(text).not.toContain(secret);
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
