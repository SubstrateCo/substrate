import { askRequestPayload } from "@startup-os/contracts/agent-work";

import { registerDevice } from "../../core/devices/repository";
import { AccessDeniedError } from "../../errors";
import { agentWakes, userAgents } from "../../schema";
import { agentWorkFixture, dmTurn } from "../../testing/agent-work";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { declineProposal, respondToRequest } from "./decisions";
import { openRequest } from "./device-requests";
import { loadSources } from "./sources";
import { ackWakes, pullWakes } from "./wakes";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

test("only the home device pulls an agent's wakes, and ack is idempotent", async () => {
  const { agent, alice, dm } = await agentWorkFixture(f);
  const message = await alice.sendMessage(dm.id, "Check the build");
  const laptop = { ...agent.identity, installationId: crypto.randomUUID() };
  await registerDevice(f.db, "alice", { ...laptop, name: "Other", platform: "darwin" });
  expect(await pullWakes(f.db, laptop, 50)).toEqual([]);

  const [wake, ...rest] = await pullWakes(f.db, agent.identity, 50);
  expect(rest).toEqual([]);
  expect(wake).toMatchObject({
    userAgentId: agent.agentId,
    source: "owner_message",
    sessionKey: `dm:${dm.id}`,
    sourceRef: { messageId: message.id },
  });
  // A wake stays until the home device stores it; another device cannot ack it.
  expect(await ackWakes(f.db, laptop, [wake!.id])).toEqual({ acked: 0 });
  expect(await pullWakes(f.db, agent.identity, 50)).toHaveLength(1);
  const acks = [
    await ackWakes(f.db, agent.identity, [wake!.id]),
    await ackWakes(f.db, agent.identity, [wake!.id]),
  ];
  expect(acks).toEqual([{ acked: 1 }, { acked: 0 }]);
  expect(await pullWakes(f.db, agent.identity, 50)).toEqual([]);
});

test("an agent without a home is adopted by the first desktop that pulls its wakes", async () => {
  const { agent, alice, dm } = await agentWorkFixture(f);
  await f.db.update(userAgents).set({ homeDeviceId: null });
  await alice.sendMessage(dm.id, "Hello");
  expect(await pullWakes(f.db, agent.identity, 50)).toHaveLength(1);
  const [row] = await f.db.select().from(userAgents).where(eq(userAgents.id, agent.agentId));
  expect(row!.homeDeviceId).toBe(agent.device.id);
});

test("other people and organizations cannot pull or ack someone's wakes", async () => {
  const { agent, alice, dm } = await agentWorkFixture(f);
  await alice.sendMessage(dm.id, "Private");
  const bobDevice = { userId: "bob", organizationId: f.orgA, installationId: crypto.randomUUID() };
  expect(await rejection(pullWakes(f.db, bobDevice, 50))).toBeInstanceOf(AccessDeniedError);
  await registerDevice(f.db, "bob", { ...bobDevice, name: "Bob", platform: "linux" });
  expect(await pullWakes(f.db, bobDevice, 50)).toEqual([]);
  expect(
    await rejection(pullWakes(f.db, { ...agent.identity, organizationId: f.orgB }, 50)),
  ).toBeInstanceOf(AccessDeniedError);
});

test("answer and approval wakes carry the decided request for the agent's home device", async () => {
  const { agent, dm, owner, call } = await agentWorkFixture(f);
  const turn = dmTurn(dm.id);
  const asked = await call(
    "reply",
    {
      requestId: crypto.randomUUID(),
      body: "Which week?",
      ask: { question: "Which week?", options: [{ label: "This week" }, { label: "Next week" }] },
    },
    turn,
  );
  const answer = { type: "questions" as const, answers: { answer: ["Next week"] } };
  await respondToRequest(f.db, owner, asked.questionId!, answer);
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  const proposed = await call(
    "propose",
    {
      requestId: crypto.randomUUID(),
      summary: "Track the checklist",
      action: { type: "create_task", input: { projectId: project.entityId, title: "Checklist" } },
    },
    turn,
  );
  await declineProposal(f.db, owner, proposed.proposalId);

  const wakes = await pullWakes(f.db, agent.identity, 50);
  expect(wakes.find((wake) => wake.source === "answer")?.request).toEqual({
    id: asked.questionId!,
    kind: "question",
    status: "resolved",
    payload: askRequestPayload({
      question: "Which week?",
      options: [{ label: "This week" }, { label: "Next week" }],
      multiSelect: false,
      allowCustom: true,
    }),
    response: answer,
    outcome: null,
    anchorMessageId: asked.messageId,
    conversationId: dm.id,
    threadId: null,
  });
  expect(wakes.find((wake) => wake.source === "approval_result")?.request).toMatchObject({
    id: proposed.proposalId,
    kind: "proposal",
    payload: { type: "proposal", summary: "Track the checklist" },
    response: null,
    outcome: { status: "declined" },
    conversationId: dm.id,
  });
});

test("a wake never carries a request of another agent or another owner", async () => {
  const { agent, dm } = await agentWorkFixture(f);
  const other = await ownedAgent(f, "alice", "Other");
  const bobs = await ownedAgent(f, "bob", "Bob's");
  const open = (identity: typeof agent.identity, userAgentId: string) =>
    openRequest(f.db, identity, {
      userAgentId,
      sessionKey: `dm:${dm.id}`,
      turnId: crypto.randomUUID(),
      epoch: 0,
      kind: "permission",
      mode: "blocking",
      nativeRequestId: crypto.randomUUID(),
      payload: {
        type: "approval",
        title: "Allow?",
        detail: null,
        options: [{ id: "allow", label: "Approve", style: "approve" }],
      },
    });
  const foreign = [
    await open(other.identity, other.agentId),
    await open(bobs.identity, bobs.agentId),
  ];
  // Forged wakes for Alice's first agent that point at those requests.
  await f.db.insert(agentWakes).values(
    foreign.map((request) => ({
      organizationId: f.orgA,
      userAgentId: agent.agentId,
      agentActorEntityId: agent.actorId,
      ownerUserId: "alice",
      source: "answer" as const,
      sourceRef: { requestId: request.id },
      sessionKey: `dm:${dm.id}`,
      dedupeKey: `answer:${request.id}`,
    })),
  );
  const wakes = await pullWakes(f.db, agent.identity, 50);
  expect(wakes.map((wake) => wake.request)).toEqual([null, null]);
});

test("sources return bodies the owner can see now, with author kinds, and drop the rest", async () => {
  const { agent, alice, bob, dm, call } = await agentWorkFixture(f);
  const channel = await alice.createConversation({
    kind: "channel",
    name: "planning",
    private: true,
    emails: ["bob@example.com"],
  });
  const own = await alice.sendMessage(channel.id, "Owner text");
  const member = await bob.sendMessage(channel.id, "Member text");
  const reply = await call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Agent text" },
    dmTurn(dm.id),
  );
  const hidden = await bob.createConversation({ kind: "channel", name: "bob", private: true });
  const secret = await bob.sendMessage(hidden.id, "Secret");
  const missing = crypto.randomUUID();

  const result = await loadSources(f.db, agent.identity, [
    own.id,
    member.id,
    reply.messageId,
    secret.id,
    missing,
  ]);
  expect(result.messages.map((message) => [message.body, message.author.kind])).toEqual([
    ["Owner text", "owner"],
    ["Member text", "member"],
    ["Agent text", "agent"],
  ]);
  expect(result.messages[0]).toMatchObject({
    conversationId: channel.id,
    conversationName: "planning",
    conversationKind: "channel",
    threadId: null,
  });
  expect(result.inaccessible.toSorted()).toEqual([secret.id, missing].toSorted());

  // Access is checked on every load: after leaving, the channel's messages are dropped.
  await alice.leaveConversation(channel.id, "bob");
  expect((await loadSources(f.db, agent.identity, [own.id])).inaccessible).toEqual([own.id]);
});
