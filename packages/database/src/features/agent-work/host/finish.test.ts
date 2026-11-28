import { sessionKeys } from "@substrate/contracts/agent-work";
import { realtimeKeys, type RealtimeHint } from "@substrate/contracts/realtime";

import { registerDevice } from "../../../core/devices/repository";
import { ConflictError } from "../../../errors";
import { agentHelpers, agentWorkItems } from "../../../schema";
import { hostWork } from "../../../testing/agent-work";
import { setupDatabase } from "../../../testing/database";
import { hostFixture } from "../../../testing/host";
import { rejection } from "../../../testing/rejection";
import { expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const f = setupDatabase();

async function runningTurn() {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "Summarize the week");
  const [claimed] = await x.claim();
  const host = await hostWork(f.db, x.agent.identity);
  expect((await host.start(claimed!.turn.id, { attempt: 1, droppedItemIds: [] })).result).toEqual({
    status: "running",
  });
  const session = await x.session({ key: claimed!.session.key, kind: "dm" });
  const steered = [];
  for (let index = 0; index < 3; index++) {
    const item = await x.item(session, {
      source: "owner_message",
      messageId: crypto.randomUUID(),
      conversationId: x.dm.id,
      threadId: null,
    });
    await f.db
      .update(agentWorkItems)
      .set({ status: "submitted", steered: true, turnId: claimed!.turn.id })
      .where(eq(agentWorkItems.id, item.id));
    steered.push(item.id);
  }
  return { ...x, host, claimed: claimed!, batch: claimed!.items[0]!.id, steered };
}

test("finishing consumes the batch, requeues steered items still queued, and needs the owner for the rest", async () => {
  const x = await runningTurn();
  // SAFETY: runningTurn steers exactly three items.
  const [read, queued, unknown] = x.steered as [string, string, string];
  const finished = await x.host.finish(x.claimed.turn.id, {
    attempt: 1,
    status: "completed",
    outcome: "replied",
    error: null,
    attentionReason: null,
    interruption: null,
    consumedItemIds: [read],
    stillQueuedItemIds: [queued],
    usage: { inputTokens: 10 },
  });
  const { consumed, ...settled } = finished.result;
  expect(settled).toEqual({ status: "needs_attention", requeued: [queued], uncertain: [unknown] });
  const byId = (a: string, b: string) => a.localeCompare(b);
  expect(consumed.toSorted(byId)).toEqual([x.batch, read].toSorted(byId));
  expect(await x.turnRow(x.claimed.turn.id)).toMatchObject({
    status: "needs_attention",
    attentionReason: "uncertain_input",
    outcome: "replied",
    usage: { inputTokens: 10 },
    leaseDeviceId: null,
  });
  expect(await x.itemRow(queued)).toMatchObject({
    status: "confirmed_unconsumed",
    steered: false,
    turnId: null,
  });
  expect((await x.itemRow(unknown)).status).toBe("uncertain");
  await x.host.progress(x.claimed.turn.id, { attempt: 1, consumedItemIds: [unknown] });
  expect((await x.turnRow(x.claimed.turn.id)).status).toBe("completed");
  const [next] = await x.claim();
  expect(next!.items.map((item) => item.id)).toEqual([queued]);
});

const finished = {
  attempt: 1,
  status: "completed" as const,
  outcome: null,
  error: null,
  attentionReason: null,
  interruption: null,
  consumedItemIds: [],
  stillQueuedItemIds: [],
  usage: null,
};

async function decidedProposals(x: Awaited<ReturnType<typeof runningTurn>>) {
  const session = await x.session({ key: x.claimed.session.key, kind: "dm" });
  const seen = crypto.randomUUID();
  const unseen = crypto.randomUUID();
  const ref = (requestId: string) =>
    ({ source: "approval_result", requestId, anchorMessageId: null }) as const;
  return {
    seen: await x.item(session, ref(seen)),
    unseen: await x.item(session, ref(unseen)),
    seenId: seen,
  };
}

test("a decision that a held tool call received in the turn never starts another turn", async () => {
  const x = await runningTurn();
  const proposals = await decidedProposals(x);
  await x.host.progress(x.claimed.turn.id, {
    attempt: 1,
    consumedItemIds: [],
    decidedRequestIds: [proposals.seenId],
  });
  expect(await x.itemRow(proposals.seen.id)).toMatchObject({
    status: "consumed",
    turnId: x.claimed.turn.id,
  });
  expect((await x.itemRow(proposals.unseen.id)).status).toBe("pending");
  await x.host.finish(x.claimed.turn.id, { ...finished, consumedItemIds: x.steered });
  const [next] = await x.claim();
  expect(next!.items.map((item) => item.id)).toEqual([proposals.unseen.id]);
});

test("a turn's end consumes the decisions it received inline", async () => {
  const x = await runningTurn();
  const proposals = await decidedProposals(x);
  await x.host.finish(x.claimed.turn.id, {
    ...finished,
    consumedItemIds: x.steered,
    decidedRequestIds: [proposals.seenId],
  });
  expect((await x.itemRow(proposals.seen.id)).status).toBe("consumed");
  const [next] = await x.claim();
  expect(next!.items.map((item) => item.id)).toEqual([proposals.unseen.id]);
});

test("a turn's inline decisions do not consume the same request's item in another session", async () => {
  const x = await runningTurn();
  const other = await x.session({ key: sessionKeys.routine(crypto.randomUUID()), kind: "routine" });
  const requestId = crypto.randomUUID();
  const item = await x.item(other, { source: "approval_result", requestId, anchorMessageId: null });
  await x.host.progress(x.claimed.turn.id, {
    attempt: 1,
    consumedItemIds: [],
    decidedRequestIds: [requestId],
  });
  expect((await x.itemRow(item.id)).status).toBe("pending");
});

test("a turn that needs attention keeps its batch, and a resume note queues a recovery item", async () => {
  const x = await runningTurn();
  await x.host.finish(x.claimed.turn.id, {
    attempt: 1,
    status: "needs_attention",
    outcome: null,
    error: "The harness failed.",
    attentionReason: "failed",
    interruption: null,
    consumedItemIds: x.steered,
    stillQueuedItemIds: [],
    usage: null,
    resume: "Continue the summary.",
  });
  expect(await x.turnRow(x.claimed.turn.id)).toMatchObject({
    status: "needs_attention",
    attentionReason: "failed",
    error: "The harness failed.",
  });
  expect((await x.itemRow(x.batch)).status).toBe("submitted");
  const [recovery] = await f.db
    .select()
    .from(agentWorkItems)
    .where(eq(agentWorkItems.source, "recovery"));
  expect(recovery).toMatchObject({
    body: "Continue the summary.",
    sourceRef: { source: "recovery", turnId: x.claimed.turn.id },
    lane: "system",
  });
});

test("only the device that holds the current attempt reports the turn", async () => {
  const x = await runningTurn();
  const finish = { status: "completed" as const, outcome: null, error: null } as const;
  const input = {
    ...finish,
    attentionReason: null,
    interruption: null,
    consumedItemIds: [],
    stillQueuedItemIds: [],
    usage: null,
  };
  expect(
    await rejection(x.host.finish(x.claimed.turn.id, { ...input, attempt: 2 })),
  ).toBeInstanceOf(ConflictError);
  const installationId = crypto.randomUUID();
  await registerDevice(f.db, "alice", { installationId, name: "Other", platform: "linux" });
  const other = await hostWork(f.db, { ...x.agent.identity, installationId });
  expect(await rejection(other.finish(x.claimed.turn.id, { ...input, attempt: 1 }))).toBeInstanceOf(
    Error,
  );
  await x.host.finish(x.claimed.turn.id, { ...input, attempt: 1, consumedItemIds: x.steered });
  expect(
    await rejection(x.host.finish(x.claimed.turn.id, { ...input, attempt: 1 })),
  ).toBeInstanceOf(ConflictError);
});

test("a helper whose turn ended without a report fails, and its parent learns it", async () => {
  const x = await hostFixture(f);
  const parent = await x.session({ key: sessionKeys.dm(x.dm.id), kind: "dm" });
  const helperId = crypto.randomUUID();
  const session = await x.session({
    key: sessionKeys.helper(helperId),
    kind: "helper",
    parentSessionId: parent.id,
  });
  await f.db.insert(agentHelpers).values({
    id: helperId,
    organizationId: f.orgA,
    userAgentId: x.agent.agentId,
    agentActorEntityId: x.agent.actorId,
    ownerUserId: "alice",
    parentSessionId: parent.id,
    sessionId: session.id,
    requestId: crypto.randomUUID(),
    task: "Research",
  });
  await x.item(session, { source: "helper_task", helperId }, { body: "Research" });
  const [claimed] = await x.claim();
  const host = await hostWork(f.db, x.agent.identity);
  await host.finish(claimed!.turn.id, {
    attempt: 1,
    status: "completed",
    outcome: "silent",
    error: null,
    attentionReason: null,
    interruption: null,
    consumedItemIds: [],
    stillQueuedItemIds: [],
    usage: null,
  });
  const [helper] = await f.db.select().from(agentHelpers).where(eq(agentHelpers.id, helperId));
  expect(helper).toMatchObject({ status: "failed", report: null });
  const [result] = await f.db
    .select()
    .from(agentWorkItems)
    .where(eq(agentWorkItems.source, "helper_result"));
  expect(result).toMatchObject({
    sessionId: parent.id,
    body: "The helper ended without a report.",
    sourceRef: { source: "helper_result", helperId },
  });
});

test("a start drops batch items the owner cannot see, and a first attempt with nothing left ends", async () => {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "Hidden later");
  const [claimed] = await x.claim();
  const host = await hostWork(f.db, x.agent.identity);
  const started = await host.start(claimed!.turn.id, {
    attempt: 1,
    droppedItemIds: [claimed!.items[0]!.id],
  });
  expect(started.result).toEqual({ status: "cancelled" });
  expect(await x.itemRow(claimed!.items[0]!.id)).toMatchObject({
    status: "dropped",
    reason: "source_inaccessible",
  });
});

test("a turn that could not start waits again after a delay; a started one is kept", async () => {
  const x = await hostFixture(f);
  await x.alice.sendMessage(x.dm.id, "Outage");
  const [claimed] = await x.claim();
  const host = await hostWork(f.db, x.agent.identity);
  expect((await host.retryLater(claimed!.turn.id, { attempt: 1, delayMs: 60_000 })).result).toEqual(
    { result: "requeued" },
  );
  expect((await x.turnRow(claimed!.turn.id)).status).toBe("cancelled");
  const [item] = await x.items();
  expect(item!.status).toBe("pending");
  expect(await x.claim()).toEqual([]);
  const [again] = await x.claim({}, new Date(Date.now() + 120_000));
  await host.start(again!.turn.id, { attempt: 1, droppedItemIds: [] });
  expect((await host.retryLater(again!.turn.id, { attempt: 1, delayMs: 0 })).result).toEqual({
    result: "kept",
  });
});

test("progress hints say when only the activity text changed, and repeat nothing", async () => {
  const x = await runningTurn();
  const report = async (input: { activity?: string | null; state?: "running" | "waiting" }) =>
    (await x.host.progress(x.claimed.turn.id, { attempt: 1, consumedItemIds: [], ...input })).hints;
  const audience = realtimeKeys.user("alice");
  const owner: RealtimeHint = { audience, domain: "agent-work" };
  const activity: RealtimeHint = { audience, domain: "agent-work", scope: "activity" };
  const reading = { activity: "Reading the thread" };
  expect([await report(reading), await report(reading)]).toEqual([[activity], []]);
  expect(await report({ state: "waiting", activity: "Waiting for approval" })).toEqual([owner]);
  expect((await x.turnRow(x.claimed.turn.id)).activity).toBe("Waiting for approval");
});
