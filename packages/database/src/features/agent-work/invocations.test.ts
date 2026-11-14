import { maxAdmittedInvocationsPerDay, sessionKeys } from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { workspaceContext } from "../../core/session/workspace";
import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import {
  agentAuditEvents,
  agentInvocations,
  agentWakes,
  member,
  messagingMessages,
} from "../../schema";
import {
  callerFixture,
  deviceAgentWork,
  ownerAgentWork,
  threadTurn,
} from "../../testing/agent-work";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { recordQueries } from "../../testing/queries";
import { rejection } from "../../testing/rejection";
import { createAgentRepository } from "../agents/repository";
import { contextSearch } from "../context/search";
import { executeAgentTool } from "../mcp/committed";
import { createMessagingService } from "../messaging/service";
import { admit } from "./admission";
import { expireInvocations, revokedInvocations } from "./invocations";
import { expect, test } from "bun:test";
import { and, asc, eq, sql } from "drizzle-orm";

const f = setupDatabase();

const calls = () => f.db.select().from(agentInvocations).orderBy(asc(agentInvocations.createdAt));
const callerWakes = () =>
  f.db
    .select()
    .from(agentWakes)
    .where(eq(agentWakes.source, "caller_message"))
    .orderBy(asc(agentWakes.createdAt));
const callOf = async (messageId: string) =>
  (await calls()).find((row) => row.messageId === messageId)!;
function statusCounts(rows: { status: string }[]) {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}

/** Adds n calls of the template's agent admitted now, as copies of it on new messages. */
async function admittedCalls(template: typeof agentInvocations.$inferSelect, n: number) {
  const [message] = await f.db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, template.messageId));
  const messages = await f.db
    .insert(messagingMessages)
    .values(
      Array.from({ length: n }, () => ({
        conversationId: message!.conversationId,
        authorActorEntityId: message!.authorActorEntityId,
        authorOrganizationId: message!.authorOrganizationId,
        body: "earlier call",
      })),
    )
    .returning({ id: messagingMessages.id });
  await f.db.insert(agentInvocations).values(
    messages.map(({ id }) => ({
      ...template,
      id: crypto.randomUUID(),
      messageId: id,
      threadId: null,
      status: "admitted" as const,
      wakeId: null,
      decidedAt: new Date(),
    })),
  );
}

const auditActions = async () =>
  (
    await f.db
      .select({ action: agentAuditEvents.action })
      .from(agentAuditEvents)
      .orderBy(asc(agentAuditEvents.createdAt), asc(agentAuditEvents.id))
  ).map((row): string => row.action);

test("people call a shared agent only as its policy allows; agents and the owner never do", async () => {
  const x = await callerFixture(f);
  // Only me, the default: a member's mention records nothing and wakes nothing.
  await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  expect(await calls()).toEqual([]);

  await x.policy("anyone");
  const asked = await x.bob.sendMessage(x.channel.id, `${x.mention} summarize`);
  const [admitted] = await calls();
  expect(admitted).toMatchObject({
    status: "admitted",
    callerUserId: "bob",
    ownerUserId: "alice",
    messageId: asked.id,
    kind: "mention",
    policy: "anyone",
    allowlisted: false,
  });
  const [wake] = await callerWakes();
  expect(wake).toMatchObject({
    ownerUserId: "alice",
    sourceRef: { invocationId: admitted!.id },
    sessionKey: sessionKeys.thread(asked.id),
    dedupeKey: `call:${admitted!.id}`,
  });
  expect(admitted!.wakeId).toBe(wake!.id);

  await x.policy("ask");
  const waiting = await x.carol.sendMessage(x.channel.id, `${x.mention} draft the plan`);
  expect((await calls()).at(-1)).toMatchObject({
    messageId: waiting.id,
    status: "pending_approval",
  });
  expect(await callerWakes()).toHaveLength(1);
  const work = await ownerAgentWork(f.db, x.owner);
  const needsYou = await work.listNeedsYou();
  expect(needsYou.calls).toEqual([
    expect.objectContaining({
      status: "pending_approval",
      caller: { actorId: x.carolActorId, name: "Carol" },
      place: expect.objectContaining({ access: "visible", anchorMessageId: waiting.id }),
      preview: `${x.mention} draft the plan`,
    }),
  ]);
  // Only the owner sees calls of the agent.
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  expect((await bobWork.listNeedsYou()).calls).toEqual([]);

  await work.allowCaller(x.agent.agentId, x.carolActorId);
  const allowed = await x.carol.sendMessage(x.channel.id, `${x.mention} again`);
  expect((await calls()).at(-1)).toMatchObject({
    messageId: allowed.id,
    status: "admitted",
    allowlisted: true,
  });
  expect(await callerWakes()).toHaveLength(2);

  // Agent-written messages never wake, and the owner's own mention is an owner message.
  await createMessagingService(f.db, x.agentIdentity).sendMessage(
    x.channel.id,
    `${x.mention} loop`,
  );
  const own = await x.alice.sendMessage(x.channel.id, `${x.mention} mine`);
  expect(await calls()).toHaveLength(3);
  expect(
    await f.db
      .select({ source: agentWakes.source })
      .from(agentWakes)
      .where(eq(agentWakes.dedupeKey, `msg:${own.id}`)),
  ).toEqual([{ source: "owner_message" }]);
});

test("partners, places the owner cannot see, and disabled triggers never call", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const shared = await f.messaging("alice").createConversation({
    kind: "channel",
    name: "partners",
    private: true,
    emails: ["outside@example.com"],
  });
  await x.alice.addAgent(shared.id, x.agent.agentId);
  const partner = createMessagingService(f.db, { userId: "outsider", organizationId: f.orgB });
  await partner.sendMessage(shared.id, `${x.mention} help`);

  // Alice leaves a private channel: her agent stays a member, but she cannot see it any more.
  const hidden = await x.alice.createConversation({
    kind: "channel",
    name: "private",
    private: true,
    emails: ["bob@example.com"],
  });
  await x.alice.addAgent(hidden.id, x.agent.agentId);
  await x.alice.leaveConversation(hidden.id, "bob");
  await x.bob.sendMessage(hidden.id, `${x.mention} help`);

  await createAgentRepository(f.db, "alice").saveTriggers({
    agentId: x.agent.agentId,
    triggers: [{ kind: "mention", enabled: false }],
  });
  await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  expect(await calls()).toEqual([]);
  expect(await callerWakes()).toEqual([]);
});

test("a thread reply calls only where the agent answered that caller", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} start`);
  const [first] = await calls();
  await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Started" },
    { ...threadTurn(x.channel.id, root.id), invocationIds: [first!.id] },
  );
  await x.carol.sendMessage(x.channel.id, "me too", root.id);
  const reply = await x.bob.sendMessage(x.channel.id, "and the risks", root.id);
  expect((await calls()).map((row) => [row.callerUserId, row.kind, row.messageId])).toEqual([
    ["bob", "mention", root.id],
    ["bob", "thread_reply", reply.id],
  ]);
  expect((await callerWakes()).map((wake) => wake.sessionKey)).toEqual([
    sessionKeys.thread(root.id),
    sessionKeys.thread(root.id),
  ]);
});

test("a thread reply does not call where the agent only asked, or replied to someone else", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} start`);
  const [first] = await calls();
  const turn = { ...threadTurn(x.channel.id, root.id), invocationIds: [first!.id] };
  // The agent works on Bob's call but publishes no reply: it only proposes in the thread.
  const project = await f.forActor(f.alice).projects.create({ name: "Work" });
  await x.call(
    "propose",
    {
      requestId: crypto.randomUUID(),
      summary: "Track it",
      action: { type: "create_task", input: { projectId: project.entityId, title: "Track" } },
    },
    turn,
  );
  // The agent replies in the thread to its owner, in a turn that answers no call.
  await x.alice.sendMessage(x.channel.id, `${x.mention} note this`, root.id);
  await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Noted" },
    threadTurn(x.channel.id, root.id),
  );
  await x.bob.sendMessage(x.channel.id, "and the risks", root.id);
  expect((await calls()).map((row) => row.messageId)).toEqual([root.id]);
  expect(await callerWakes()).toHaveLength(1);
});

test("a caller has at most three calls waiting for the owner; more are rate limited", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  for (const n of [1, 2, 3, 4]) await x.bob.sendMessage(x.channel.id, `${x.mention} ask ${n}`);
  expect((await calls()).map((row) => row.status)).toEqual([
    "pending_approval",
    "pending_approval",
    "pending_approval",
    "rate_limited",
  ]);
  // Another caller has their own limit.
  await x.carol.sendMessage(x.channel.id, `${x.mention} mine`);
  expect((await calls()).at(-1)!.status).toBe("pending_approval");
});

test("owner approvals count toward the daily cap and are never blocked by it", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  const first = await x.bob.sendMessage(x.channel.id, `${x.mention} first`);
  const pending = await callOf(first.id);
  await admittedCalls(pending, maxAdmittedInvocationsPerDay - 1);
  const work = await ownerAgentWork(f.db, x.owner);
  // The approval is the 100th call admitted today.
  expect((await work.decideInvocation(pending.id, "approve")).result).toEqual({
    status: "admitted",
  });
  await x.policy("anyone");
  const over = await x.carol.sendMessage(x.channel.id, `${x.mention} over`);
  expect((await callOf(over.id)).status).toBe("rate_limited");
  // At the cap, the owner still approves.
  await x.policy("ask");
  const later = await x.bob.sendMessage(x.channel.id, `${x.mention} later`);
  const held = await callOf(later.id);
  expect(held.status).toBe("pending_approval");
  expect((await work.decideInvocation(held.id, "approve")).result).toEqual({
    status: "admitted",
  });
});

/** Inserts messages like a sent one with the given bodies, as message triggers by the user. */
async function messageTriggers(sent: { id: string }, bodies: string[], userId: string) {
  const [message] = await f.db
    .select()
    .from(messagingMessages)
    .where(eq(messagingMessages.id, sent.id));
  const copies = await f.db
    .insert(messagingMessages)
    .values(
      bodies.map((body) => ({
        conversationId: message!.conversationId,
        authorActorEntityId: message!.authorActorEntityId,
        authorOrganizationId: message!.authorOrganizationId,
        body,
      })),
    )
    .returning();
  return copies.map((copy) => ({
    type: "message" as const,
    organizationId: f.orgA,
    author: { kind: "human" as const, userId },
    message: copy,
    conversationKind: "channel" as const,
  }));
}

/** Admits copies of a sent message as message triggers in one admit() call. */
async function admitBatch(sent: { id: string; body: string }, n: number, userId: string) {
  const triggers = await messageTriggers(sent, Array(n).fill(sent.body), userId);
  await f.db.transaction((tx) => admit(tx, triggers));
  return triggers.map((trigger) => trigger.message.id);
}

test("admissions for the same agent finish while another admission is uncommitted", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const sent = await x.carol.sendMessage(x.channel.id, "hello");
  const first = await messageTriggers(sent, [x.mention], "carol");
  const second = await messageTriggers(sent, [x.mention], "carol");
  // Keep the first transaction open after admission, as a message send would.
  await f.db.transaction(async (tx) => {
    await admit(tx, first);
    await f.db.transaction(async (other) => {
      await other.execute(sql`set local lock_timeout = '1s'`);
      await admit(other, second);
    });
    expect(statusCounts(await calls())).toEqual({ admitted: 1 });
  });
  expect(statusCounts(await calls())).toEqual({ admitted: 2 });
});

test("a batch of calls counts earlier decisions in the batch toward the pending cap", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  const first = await x.bob.sendMessage(x.channel.id, `${x.mention} ask`);
  await admitBatch(first, 3, "bob");
  // Calls recorded in one transaction share created_at, so compare counts, not order.
  expect(statusCounts(await calls())).toEqual({ pending_approval: 3, rate_limited: 1 });
});

test("one message batches caller facts and wake links across agents", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const second = await ownedAgent(f, "carol");
  const secondOwner = await ownerAgentWork(f.db, { userId: "carol", organizationId: f.orgA });
  await secondOwner.saveCallerPolicy(second.agentId, "ask");
  await secondOwner.allowCaller(second.agentId, f.bob);
  await x.carol.addAgent(x.channel.id, second.agentId);
  const sent = await x.bob.sendMessage(x.channel.id, "hello");
  const triggers = await messageTriggers(
    sent,
    [`${x.mention} @[agent:${second.actorId}] help`],
    "bob",
  );
  const recorded = recordQueries();
  await recorded.db.transaction((tx) => admit(tx, triggers));
  const admitted = (await calls()).filter((row) => row.messageId === triggers[0]!.message.id);
  expect(admitted).toHaveLength(2);
  expect(admitted.every((row) => row.status === "admitted" && row.wakeId !== null)).toBe(true);
  expect(admitted.find((row) => row.userAgentId === second.agentId)).toMatchObject({
    policy: "ask",
    allowlisted: true,
  });
  expect(admitted.find((row) => row.userAgentId === x.agent.agentId)).toMatchObject({
    policy: "anyone",
    allowlisted: false,
  });
  expect(
    recorded.queries.filter(
      (query) => query.startsWith("select ") && query.includes('"user_agent_callers"'),
    ),
  ).toHaveLength(1);
  expect(
    recorded.queries.filter((query) => query.startsWith('update "agent_invocations"')),
  ).toHaveLength(1);
  const wakes = await callerWakes();
  for (const call of admitted)
    expect(wakes.find((wake) => wake.id === call.wakeId)?.sourceRef).toEqual({
      invocationId: call.id,
    });
});

test("batched caller visibility remains bound to each agent owner", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const second = await ownedAgent(f, "carol");
  const secondOwner = await ownerAgentWork(f.db, { userId: "carol", organizationId: f.orgA });
  await secondOwner.saveCallerPolicy(second.agentId, "ask");
  const channel = await x.alice.createConversation({
    kind: "channel",
    name: "private callers",
    private: true,
    emails: ["bob@example.com", "carol@example.com"],
  });
  await x.alice.addAgent(channel.id, x.agent.agentId);
  await x.carol.addAgent(channel.id, second.agentId);
  await x.alice.leaveConversation(channel.id, "bob");
  const sent = await x.bob.sendMessage(channel.id, `${x.mention} @[agent:${second.actorId}] help`);
  expect((await calls()).filter((row) => row.messageId === sent.id)).toEqual([
    expect.objectContaining({ userAgentId: second.agentId, status: "pending_approval" }),
  ]);
  expect(await callerWakes()).toEqual([]);
});

test("source revocation batches call checks and trigger toggles without crossing owners", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const first = await x.bob.sendMessage(x.channel.id, x.mention);
  const second = await x.carol.sendMessage(x.channel.id, x.mention);
  const other = await ownedAgent(f, "bob");
  const otherOwner = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  await otherOwner.saveCallerPolicy(other.agentId, "anyone");
  await x.bob.addAgent(x.channel.id, other.agentId);
  const foreign = await x.alice.sendMessage(x.channel.id, `@[agent:${other.actorId}]`);
  const foreignCall = await callOf(foreign.id);
  await f.db
    .delete(member)
    .where(and(eq(member.userId, "carol"), eq(member.organizationId, f.orgA)));
  const [firstCall, secondCall] = [await callOf(first.id), await callOf(second.id)];
  const unknown = crypto.randomUUID();
  const recorded = recordQueries();
  const checked = await recorded.db.transaction((tx) =>
    revokedInvocations(tx, x.owner, [firstCall.id, secondCall.id, foreignCall.id, unknown]),
  );
  expect(new Set(checked.revoked)).toEqual(new Set([secondCall.id, foreignCall.id, unknown]));
  expect(checked.allowed).toEqual(new Set([first.id]));
  expect(checked.blocked).toEqual(new Set([second.id]));
  expect((await callOf(second.id)).status).toBe("dropped");
  expect((await callOf(foreign.id)).status).toBe("admitted");
  expect(
    await f.db
      .select({ invocationId: agentAuditEvents.invocationId, result: agentAuditEvents.result })
      .from(agentAuditEvents)
      .where(eq(agentAuditEvents.action, "invocation_dropped")),
  ).toEqual([{ invocationId: secondCall.id, result: "revoked" }]);
  expect(recorded.queries.filter((query) => query.startsWith("select "))).toHaveLength(2);
});

test("a batch of calls counts earlier decisions in the batch toward the daily cap", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const first = await x.carol.sendMessage(x.channel.id, `${x.mention} run`);
  await admittedCalls(await callOf(first.id), maxAdmittedInvocationsPerDay - 2);
  const ids = new Set(await admitBatch(first, 2, "carol"));
  const batch = (await calls()).filter((row) => ids.has(row.messageId));
  expect(statusCounts(batch)).toEqual({ admitted: 1, rate_limited: 1 });
  expect(await callerWakes()).toHaveLength(2);
});

test("the first decision wins, an approval wakes the agent once, and always allow allowlists", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  await x.bob.sendMessage(x.channel.id, `${x.mention} one`);
  const [call] = await calls();
  const work = await ownerAgentWork(f.db, x.owner);
  const results = await Promise.allSettled([
    work.decideInvocation(call!.id, "approve"),
    work.decideInvocation(call!.id, "approve"),
  ]);
  const won = results.filter((result) => result.status === "fulfilled");
  const lost = results.filter((result) => result.status === "rejected");
  expect(won).toHaveLength(1);
  expect(lost.map((result) => result.reason)).toEqual([expect.any(ConflictError)]);
  const [decided] = await calls();
  const wakes = await callerWakes();
  expect(wakes).toHaveLength(1);
  expect(decided).toMatchObject({ status: "admitted", wakeId: wakes[0]!.id });
  expect((await auditActions()).filter((action) => action === "invocation_approved")).toHaveLength(
    1,
  );

  await x.carol.sendMessage(x.channel.id, `${x.mention} two`);
  const carolCall = (await calls()).at(-1)!;
  // Only the owner decides.
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  expect(await rejection(bobWork.decideInvocation(carolCall.id, "approve"))).toBeInstanceOf(
    AccessDeniedError,
  );
  const approved = await work.decideInvocation(carolCall.id, "always_allow");
  expect(approved.result).toEqual({ status: "admitted" });
  // The owner refreshes work lists; the caller learns only that their call changed.
  expect(approved.hints).toEqual(
    expect.arrayContaining([
      { audience: realtimeKeys.user("alice"), domain: "agent-work" },
      { audience: realtimeKeys.user("carol"), domain: "agent-work" },
    ]),
  );
  const [wake] = await f.db
    .select()
    .from(agentWakes)
    .where(eq(agentWakes.dedupeKey, `call:${carolCall.id}`));
  expect(wake).toMatchObject({
    source: "caller_message",
    sourceRef: { invocationId: carolCall.id },
  });
  await x.carol.sendMessage(x.channel.id, `${x.mention} three`);
  expect((await calls()).at(-1)).toMatchObject({ status: "admitted", allowlisted: true });
});

test("rolling back an approval also rolls back its wake and decision audit", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  const message = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const call = await callOf(message.id);
  const rollback = new Error("Roll back approval");
  expect(
    await rejection(
      f.db.transaction(async (tx) => {
        await (await ownerAgentWork(tx, x.owner)).decideInvocation(call.id, "approve");
        throw rollback;
      }),
    ),
  ).toBe(rollback);
  expect(await callOf(message.id)).toMatchObject({ status: "pending_approval", wakeId: null });
  expect(await callerWakes()).toEqual([]);
  expect(await auditActions()).not.toContain("invocation_approved");
});

test("approving a call whose trigger the owner disabled since cancels it", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  await x.bob.sendMessage(x.channel.id, `${x.mention} later`);
  const [call] = await calls();
  await createAgentRepository(f.db, "alice").saveTriggers({
    agentId: x.agent.agentId,
    triggers: [{ kind: "mention", enabled: false }],
  });
  const work = await ownerAgentWork(f.db, x.owner);
  const decided = await work.decideInvocation(call!.id, "always_allow");
  expect(decided.result).toEqual({ status: "cancelled" });
  expect(await callerWakes()).toEqual([]);
  // A cancelled approval does not allowlist the caller.
  expect(await auditActions()).not.toContain("caller_allowed");
});

test("a decision after expiry fails, and maintenance expires the call", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  await x.bob.sendMessage(x.channel.id, `${x.mention} late`);
  const [call] = await calls();
  await f.db
    .update(agentInvocations)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(agentInvocations.id, call!.id));
  const work = await ownerAgentWork(f.db, x.owner);
  expect(await rejection(work.decideInvocation(call!.id, "approve"))).toBeInstanceOf(ConflictError);
  expect(await callerWakes()).toEqual([]);
  expect((await work.listNeedsYou()).calls).toEqual([]);
  expect((await work.listInvocations()).map((view) => view.status)).toEqual(["expired"]);
  expect(await expireInvocations(f.db, 10)).toBe(1);
  expect((await calls())[0]!.status).toBe("expired");
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  const mine = await bobWork.listMyCalls(x.channel.id);
  expect(mine.map((view) => view.status)).toEqual(["expired"]);
});

test("switching to owner only cancels waiting calls and drops queued ones at the source check", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const queued = await x.bob.sendMessage(x.channel.id, `${x.mention} queued`);
  await x.policy("ask");
  await x.carol.sendMessage(x.channel.id, `${x.mention} waiting`);
  await x.policy("owner");
  const [admitted, pending] = await calls();
  expect(pending!.status).toBe("cancelled");
  const device = await deviceAgentWork(f.db, x.agent.identity);
  const checked = await device.loadSources([queued.id], [admitted!.id]);
  expect(checked.result).toMatchObject({
    messages: [],
    inaccessible: [queued.id],
    inaccessibleInvocations: [admitted!.id],
  });
  expect((await calls())[0]!.status).toBe("dropped");
  // Rows of one transaction share a timestamp, so compare without order.
  expect((await auditActions()).sort()).toEqual(
    [
      "policy_changed",
      "invocation_admitted",
      "policy_changed",
      "invocation_held",
      "policy_changed",
      "invocation_cancelled",
      "invocation_dropped",
    ].sort(),
  );
});

test("allowlist removal and a caller who leaves the organization revoke queued calls", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  const work = await ownerAgentWork(f.db, x.owner);
  const device = await deviceAgentWork(f.db, x.agent.identity);
  await work.allowCaller(x.agent.agentId, x.carolActorId);
  const first = await x.carol.sendMessage(x.channel.id, `${x.mention} first`);
  const second = await x.carol.sendMessage(x.channel.id, `${x.mention} second`);
  const [one, two] = await calls();
  const sources = (messageIds: string[], invocationIds: string[]) =>
    device.loadSources(messageIds, invocationIds).then((value) => value.result);
  // While the call may run, the source check returns its message with the caller as author.
  expect((await sources([], [one!.id])).messages).toEqual([
    expect.objectContaining({
      id: first.id,
      author: { actorId: x.carolActorId, name: "Carol", kind: "member" },
    }),
  ]);
  await work.removeCaller(x.agent.agentId, x.carolActorId);
  expect((await sources([first.id], [one!.id])).inaccessibleInvocations).toEqual([one!.id]);

  await work.allowCaller(x.agent.agentId, x.carolActorId);
  await f.db
    .delete(member)
    .where(and(eq(member.userId, "carol"), eq(member.organizationId, f.orgA)));
  expect(await sources([second.id], [two!.id])).toMatchObject({
    messages: [],
    inaccessibleInvocations: [two!.id],
  });
  expect((await calls()).map((row) => row.status)).toEqual(["dropped", "dropped"]);
});

test("a queued call drops at the source check once the owner disables its trigger", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const asked = await x.bob.sendMessage(x.channel.id, `${x.mention} queued`);
  const call = await callOf(asked.id);
  await createAgentRepository(f.db, "alice").saveTriggers({
    agentId: x.agent.agentId,
    triggers: [{ kind: "mention", enabled: false }],
  });
  const checked = await (await deviceAgentWork(f.db, x.agent.identity)).loadSources([], [call.id]);
  expect(checked.result).toMatchObject({ messages: [], inaccessibleInvocations: [call.id] });
  expect(await callOf(asked.id)).toMatchObject({ status: "dropped", dropReason: "revoked" });
  expect(await auditActions()).toContain("invocation_dropped");
});

test("a caller sees a call as queued until the agent's reply for it is published", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const call = await callOf(root.id);
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  const bobCalls = () => bobWork.listMyCalls(x.channel.id);
  expect((await bobCalls()).map((view) => view.status)).toEqual(["queued"]);
  // A reply in a turn that answers no call is not an answer to this call.
  await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "For Alice" },
    threadTurn(x.channel.id, root.id),
  );
  expect((await bobCalls()).map((view) => view.status)).toEqual(["queued"]);
  await x.call(
    "reply",
    { requestId: crypto.randomUUID(), body: "Done" },
    { ...threadTurn(x.channel.id, root.id), invocationIds: [call.id] },
  );
  expect((await bobCalls()).map((view) => view.status)).toEqual(["answered"]);
});

test("caller wakes withheld from an old desktop for a day drop and ask the owner to update", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const asked = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const call = await callOf(asked.id);
  const age = (hours: number) =>
    f.db
      .update(agentWakes)
      .set({ createdAt: new Date(Date.now() - hours * 60 * 60_000) })
      .where(eq(agentWakes.source, "caller_message"));
  const work = await ownerAgentWork(f.db, x.owner);
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  const device = await deviceAgentWork(f.db, x.agent.identity);
  const signal = async () => (await work.listNeedsYou()).desktopUpdateRequired;
  await age(23);
  expect((await device.pullWakes(50)).result).toEqual([]);
  expect((await callOf(asked.id)).status).toBe("admitted");
  expect(await signal()).toEqual([]);

  await age(25);
  expect((await device.pullWakes(50)).result).toEqual([]);
  expect(await callOf(asked.id)).toMatchObject({
    status: "dropped",
    dropReason: "desktop_needs_update",
  });
  expect(await callerWakes()).toEqual([]);
  const [dropped] = await f.db
    .select()
    .from(agentAuditEvents)
    .where(eq(agentAuditEvents.action, "invocation_dropped"));
  expect(dropped).toMatchObject({ invocationId: call.id, result: "desktop_needs_update" });
  const mine = await bobWork.listMyCalls(x.channel.id);
  expect(mine.map((view) => view.status)).toEqual(["expired"]);
  expect(await signal()).toEqual([
    {
      userAgentId: x.agent.agentId,
      agent: { actorId: x.agent.actorId, name: expect.any(String) },
      droppedCalls: 1,
      lastDroppedAt: expect.any(String),
    },
  ]);
  // Only the owner gets the signal.
  expect((await bobWork.listNeedsYou()).desktopUpdateRequired).toEqual([]);

  // An updated desktop gets old caller wakes, and storing one clears the signal.
  await x.bob.sendMessage(x.channel.id, `${x.mention} again`);
  await age(25);
  const pulled = (await device.pullWakes(50, ["caller_wakes"])).result;
  expect(pulled).toHaveLength(1);
  await device.ackWakes(pulled.map((wake) => wake.id));
  expect(await signal()).toEqual([]);
});

test("caller wakes go only to desktops that declare caller_wakes", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const asked = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const [call] = await calls();
  const device = await deviceAgentWork(f.db, x.agent.identity);
  expect((await device.pullWakes(50)).result).toEqual([]);
  const pulled = await device.pullWakes(50, ["caller_wakes"]);
  expect(pulled.result).toEqual([
    expect.objectContaining({
      source: "caller_message",
      sourceRef: { invocationId: call!.id },
      request: null,
      invocation: {
        id: call!.id,
        messageId: asked.id,
        conversationId: x.channel.id,
        threadId: null,
        kind: "mention",
        callerActorId: expect.any(String),
      },
    }),
  ]);
});

test("MCP calls of a caller turn need its admitted calls in the turn's place and are audited", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const root = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const [call] = await calls();
  const turn = { ...threadTurn(x.channel.id, root.id), invocationIds: [call!.id] };
  const replied = await x.call("reply", { requestId: crypto.randomUUID(), body: "Done" }, turn);
  const [logged] = await f.db
    .select()
    .from(agentAuditEvents)
    .where(eq(agentAuditEvents.action, "mcp_call"));
  expect(logged).toMatchObject({
    invocationId: call!.id,
    callerUserId: "bob",
    tool: "reply",
    access: "write",
    result: "ok",
    turnId: turn.turnId,
    targetIds: expect.arrayContaining([replied.messageId, x.channel.id]),
  });
  // The request ID is idempotency, not a record, and no text is stored.
  expect(JSON.stringify(logged)).not.toContain("Done");

  // A call from another place, or a call of another agent's turn, is refused and logged.
  const other = await x.alice.createConversation({ kind: "channel", name: "other" });
  const elsewhere = { ...threadTurn(other.id, root.id), invocationIds: [call!.id] };
  expect(
    await rejection(
      executeAgentTool(
        f.db,
        x.agentIdentity,
        "list_projects",
        {},
        {
          ...elsewhere,
          installationId: x.agent.identity.installationId,
        },
      ),
    ),
  ).toBeInstanceOf(ValidationError);
  const results = await f.db
    .select({ result: agentAuditEvents.result, access: agentAuditEvents.access })
    .from(agentAuditEvents)
    .where(eq(agentAuditEvents.action, "mcp_call"))
    .orderBy(asc(agentAuditEvents.createdAt));
  expect(results).toEqual([
    { result: "ok", access: "write" },
    { result: "invalid", access: "read" },
  ]);
  const log = await (await ownerAgentWork(f.db, x.owner)).listCallsLog(x.agent.agentId);
  expect(JSON.stringify(log)).not.toContain("Done");
  const bobWork = await ownerAgentWork(f.db, { userId: "bob", organizationId: f.orgA });
  expect(await rejection(bobWork.listCallsLog(x.agent.agentId))).toBeInstanceOf(AccessDeniedError);
});

test("members find a shared agent and its mode, never its allowlist; agents never do", async () => {
  const x = await callerFixture(f);
  const agents = async (userId: string, actorEntityId?: string) =>
    contextSearch(
      (await workspaceContext(f.db, { userId, organizationId: f.orgA, actorEntityId })).context,
      { userId, organizationId: f.orgA, actorEntityId },
      { query: "", kind: "agent", conversationId: x.channel.id },
    );
  expect(await agents("bob")).toEqual([]);
  await x.policy("ask");
  await (await ownerAgentWork(f.db, x.owner)).allowCaller(x.agent.agentId, x.carolActorId);
  const [found] = await agents("bob");
  expect(found).toMatchObject({ id: x.agent.actorId, kind: "agent", callMode: "ask" });
  expect(found).not.toHaveProperty("agentId");
  expect((await agents("alice"))[0]).toMatchObject({ agentId: x.agent.agentId });
  // Bob's own agent, searching as itself, does not find Alice's shared agent.
  const scout = await ownedAgent(f, "bob", "Scout");
  expect(await agents("bob", scout.actorId)).toEqual([]);
  const profile = await x.bob.getProfile(x.channel.id, x.agent.actorId);
  expect(profile.agent).toEqual({
    ownerName: "Alice",
    harness: null,
    model: null,
    callMode: "ask",
  });
  expect(JSON.stringify(profile)).not.toContain(x.carolActorId);
});
