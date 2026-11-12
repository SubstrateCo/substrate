import { sessionKeys } from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { AccessDeniedError, ConflictError, ValidationError } from "../../errors";
import { agentAuditEvents, agentInvocations, agentWakes, member } from "../../schema";
import { callerFixture, threadTurn } from "../../testing/agent-work";
import { ownedAgent } from "../../testing/agents";
import { setupDatabase } from "../../testing/database";
import { rejection } from "../../testing/rejection";
import { createAgentRepository } from "../agents/repository";
import { contextSearch } from "../context/search";
import { executeAgentTool } from "../mcp/committed";
import { createMessagingService } from "../messaging/service";
import { listCallsLog } from "./audit";
import { allowCaller, decideInvocation, loadSources, pullWakes, removeCaller } from "./committed";
import { expireInvocations, listInvocations, listMyCalls } from "./invocations";
import { listNeedsYou } from "./request-views";
import { expect, test } from "bun:test";
import { and, asc, eq } from "drizzle-orm";

const f = setupDatabase();

const calls = () => f.db.select().from(agentInvocations).orderBy(asc(agentInvocations.createdAt));
const callerWakes = () =>
  f.db
    .select()
    .from(agentWakes)
    .where(eq(agentWakes.source, "caller_message"))
    .orderBy(asc(agentWakes.createdAt));
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
  const needsYou = await listNeedsYou(f.db, x.owner);
  expect(needsYou.calls).toEqual([
    expect.objectContaining({
      status: "pending_approval",
      caller: { actorId: x.carolActorId, name: "Carol" },
      place: expect.objectContaining({ access: "visible", anchorMessageId: waiting.id }),
      preview: `${x.mention} draft the plan`,
    }),
  ]);
  // Only the owner sees calls of the agent.
  expect((await listNeedsYou(f.db, { userId: "bob", organizationId: f.orgA })).calls).toEqual([]);

  await allowCaller(f.db, x.owner, x.agent.agentId, x.carolActorId);
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

test("the first decision wins, an approval wakes the agent once, and always allow allowlists", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  await x.bob.sendMessage(x.channel.id, `${x.mention} one`);
  const [call] = await calls();
  const results = await Promise.allSettled([
    decideInvocation(f.db, x.owner, call!.id, "approve"),
    decideInvocation(f.db, x.owner, call!.id, "decline"),
  ]);
  const won = results.filter((result) => result.status === "fulfilled");
  const lost = results.filter((result) => result.status === "rejected");
  expect(won).toHaveLength(1);
  expect(lost.map((result) => result.reason)).toEqual([expect.any(ConflictError)]);
  const [decided] = await calls();
  expect(await callerWakes()).toHaveLength(decided!.status === "admitted" ? 1 : 0);

  await x.carol.sendMessage(x.channel.id, `${x.mention} two`);
  const carolCall = (await calls()).at(-1)!;
  // Only the owner decides.
  expect(
    await rejection(
      decideInvocation(f.db, { userId: "bob", organizationId: f.orgA }, carolCall.id, "approve"),
    ),
  ).toBeInstanceOf(AccessDeniedError);
  const approved = await decideInvocation(f.db, x.owner, carolCall.id, "always_allow");
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

test("a decision after expiry fails, and maintenance expires the call", async () => {
  const x = await callerFixture(f);
  await x.policy("ask");
  await x.bob.sendMessage(x.channel.id, `${x.mention} late`);
  const [call] = await calls();
  await f.db
    .update(agentInvocations)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(agentInvocations.id, call!.id));
  expect(await rejection(decideInvocation(f.db, x.owner, call!.id, "approve"))).toBeInstanceOf(
    ConflictError,
  );
  expect(await callerWakes()).toEqual([]);
  expect((await listNeedsYou(f.db, x.owner)).calls).toEqual([]);
  expect((await listInvocations(f.db, x.owner)).map((view) => view.status)).toEqual(["expired"]);
  expect(await expireInvocations(f.db, 10)).toBe(1);
  expect((await calls())[0]!.status).toBe("expired");
  const mine = await listMyCalls(f.db, { userId: "bob", organizationId: f.orgA }, x.channel.id);
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
  const checked = await loadSources(f.db, x.agent.identity, [queued.id], [admitted!.id]);
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
  await allowCaller(f.db, x.owner, x.agent.agentId, x.carolActorId);
  const first = await x.carol.sendMessage(x.channel.id, `${x.mention} first`);
  const second = await x.carol.sendMessage(x.channel.id, `${x.mention} second`);
  const [one, two] = await calls();
  const sources = (messageIds: string[], invocationIds: string[]) =>
    loadSources(f.db, x.agent.identity, messageIds, invocationIds).then((value) => value.result);
  // While the call may run, the source check returns its message with the caller as author.
  expect((await sources([], [one!.id])).messages).toEqual([
    expect.objectContaining({
      id: first.id,
      author: { actorId: x.carolActorId, name: "Carol", kind: "member" },
    }),
  ]);
  await removeCaller(f.db, x.owner, x.agent.agentId, x.carolActorId);
  expect((await sources([first.id], [one!.id])).inaccessibleInvocations).toEqual([one!.id]);

  await allowCaller(f.db, x.owner, x.agent.agentId, x.carolActorId);
  await f.db
    .delete(member)
    .where(and(eq(member.userId, "carol"), eq(member.organizationId, f.orgA)));
  expect(await sources([second.id], [two!.id])).toMatchObject({
    messages: [],
    inaccessibleInvocations: [two!.id],
  });
  expect((await calls()).map((row) => row.status)).toEqual(["dropped", "dropped"]);
});

test("caller wakes go only to desktops that declare caller_wakes", async () => {
  const x = await callerFixture(f);
  await x.policy("anyone");
  const asked = await x.bob.sendMessage(x.channel.id, `${x.mention} help`);
  const [call] = await calls();
  expect((await pullWakes(f.db, x.agent.identity, 50)).result).toEqual([]);
  const pulled = await pullWakes(f.db, x.agent.identity, 50, ["caller_wakes"]);
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
  const log = await listCallsLog(f.db, x.owner, x.agent.agentId);
  expect(JSON.stringify(log)).not.toContain("Done");
  expect(
    await rejection(listCallsLog(f.db, { userId: "bob", organizationId: f.orgA }, x.agent.agentId)),
  ).toBeInstanceOf(AccessDeniedError);
});

test("members find a shared agent and its mode, never its allowlist; agents never do", async () => {
  const x = await callerFixture(f);
  const agents = (userId: string, actorEntityId?: string) =>
    contextSearch(
      f.db,
      { userId, organizationId: f.orgA, actorEntityId },
      { query: "", kind: "agent", conversationId: x.channel.id },
    );
  expect(await agents("bob")).toEqual([]);
  await x.policy("ask");
  await allowCaller(f.db, x.owner, x.agent.agentId, x.carolActorId);
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
