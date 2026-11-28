import { inboxItemMachine, turnMachine } from "@substrate/contracts/agent-work";
import type { HostFinishInput, HostProgressInput } from "@substrate/contracts/agent-work/control";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { ResolvedDeviceIdentity } from "../../../core/session/device";
import { setItemStatus } from "../items";
import { inStates } from "../machine-sql";
import { setSessionStatus } from "../sessions";
import { agentTurns } from "../turns.schema";
import { agentWorkItems } from "../work-items.schema";
import { finishTurn, noLease } from "./finish";
import { holds, liveStatuses, requireDeviceTurn, requireHeldTurn, type TurnRow } from "./held-turn";
import { leaseUntil } from "./lease-time";
import { neverStarted, recoverTurn, requeueTurn } from "./recovery";
import { settleUncertainTurn } from "./uncertain";
import { and, eq, inArray } from "drizzle-orm";

function changed(db: DatabaseExecutor, turn: Pick<TurnRow, "ownerUserId">) {
  effectsFor(db).hint({ audience: realtimeKeys.user(turn.ownerUserId), domain: "agent-work" });
}

async function statusOf(db: DatabaseExecutor, turnId: string) {
  const [row] = await db
    .select({ status: agentTurns.status })
    .from(agentTurns)
    .where(eq(agentTurns.id, turnId));
  return row!.status;
}

async function fire(
  db: DatabaseExecutor,
  turn: TurnRow,
  event: keyof typeof turnMachine.events,
  values: Partial<typeof agentTurns.$inferInsert> = {},
) {
  const updated = await db
    .update(agentTurns)
    .set({ status: turnMachine.events[event].to, ...values })
    .where(
      and(
        eq(agentTurns.id, turn.id),
        eq(agentTurns.attempt, turn.attempt),
        inStates(agentTurns.status, turnMachine.from(event)),
      ),
    )
    .returning({ id: agentTurns.id });
  return updated.length > 0;
}

export async function startTurn(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  turnId: string,
  input: { attempt: number; droppedItemIds: string[] },
  now = new Date(),
) {
  const turn = await requireHeldTurn(db, identity, turnId, input.attempt);
  if (input.droppedItemIds.length) {
    const owned = await db
      .select({ id: agentWorkItems.id })
      .from(agentWorkItems)
      .where(
        and(eq(agentWorkItems.turnId, turn.id), inArray(agentWorkItems.id, input.droppedItemIds)),
      );
    await setItemStatus(
      db,
      owned.map((item) => item.id),
      "drop",
      { reason: "source_inaccessible" },
    );
  }
  if (turn.status === "assigned" && turn.attempt === 1) {
    const remaining = await db
      .select({ id: agentWorkItems.id })
      .from(agentWorkItems)
      .where(and(eq(agentWorkItems.turnId, turn.id), eq(agentWorkItems.status, "submitted")))
      .limit(1);
    if (!remaining.length) {
      await fire(db, turn, "cancel", { finishedAt: now, ...noLease });
      await setSessionStatus(db, turn.sessionId, "rest", now);
      changed(db, turn);
      return { status: await statusOf(db, turn.id) };
    }
  }
  if (turn.status === "assigned")
    await fire(db, turn, "run", {
      startedAt: turn.startedAt ?? now,
      leaseExpiresAt: leaseUntil(now),
    });
  changed(db, turn);
  return { status: await statusOf(db, turn.id) };
}

async function consumeEvidence(db: DatabaseExecutor, turn: TurnRow, ids: string[], now: Date) {
  if (!ids.length) return;
  await db
    .update(agentWorkItems)
    .set({ status: inboxItemMachine.events.consume.to, reason: null })
    .where(
      and(
        inArray(agentWorkItems.id, ids),
        eq(agentWorkItems.turnId, turn.id),
        inStates(agentWorkItems.status, inboxItemMachine.from("consume")),
      ),
    );
  await settleUncertainTurn(db, turn.id, now);
}

async function receiveInline(db: DatabaseExecutor, turn: TurnRow, requestIds: string[] = []) {
  if (!requestIds.length) return;
  const waiting = await db
    .select({ id: agentWorkItems.id, sourceRef: agentWorkItems.sourceRef })
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.sessionId, turn.sessionId),
        eq(agentWorkItems.source, "approval_result"),
        inStates(agentWorkItems.status, inboxItemMachine.from("receiveInline")),
      ),
    );
  const decided = new Set(requestIds);
  const ids = waiting.flatMap((item) =>
    item.sourceRef.source === "approval_result" && decided.has(item.sourceRef.requestId)
      ? [item.id]
      : [],
  );
  await setItemStatus(db, ids, "receiveInline", { turnId: turn.id, held: false, reason: null });
}

export async function progressTurn(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  turnId: string,
  input: Omit<HostProgressInput, "organizationId" | "installationId">,
  now = new Date(),
) {
  const turn = await requireDeviceTurn(db, identity, turnId);
  await receiveInline(db, turn, input.decidedRequestIds);
  if (!holds(turn, identity.deviceId, input.attempt)) {
    await consumeEvidence(db, turn, input.consumedItemIds, now);
    return { status: turn.status };
  }
  if (input.state === "waiting") await fire(db, turn, "wait");
  if (input.state === "running" && turn.status === "waiting") await fire(db, turn, "run");
  const values: Partial<typeof agentTurns.$inferInsert> = { leaseExpiresAt: leaseUntil(now) };
  if (input.activity !== undefined) values.activity = input.activity;
  if (input.usage) values.usage = input.usage;
  if (input.wrappedUp) values.autoContinue = false;
  if (input.sourceMessages && !turn.sourceMessages.length)
    values.sourceMessages = input.sourceMessages;
  await db
    .update(agentTurns)
    .set(values)
    .where(
      and(
        eq(agentTurns.id, turn.id),
        eq(agentTurns.attempt, turn.attempt),
        inArray(agentTurns.status, liveStatuses),
      ),
    );
  await consumeEvidence(db, turn, input.consumedItemIds, now);
  if (input.state) changed(db, turn);
  else if (input.activity !== undefined && input.activity !== turn.activity)
    effectsFor(db).hint({
      audience: realtimeKeys.user(turn.ownerUserId),
      domain: "agent-work",
      scope: "activity",
    });
  return { status: await statusOf(db, turn.id) };
}

export async function finishHeldTurn(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  turnId: string,
  input: Omit<HostFinishInput, "organizationId" | "installationId">,
  now = new Date(),
) {
  const turn = await requireHeldTurn(db, identity, turnId, input.attempt);
  await receiveInline(db, turn, input.decidedRequestIds);
  const result = await finishTurn(db, turn, input, identity.deviceId, now);
  changed(db, turn);
  if (!result)
    return { status: await statusOf(db, turn.id), consumed: [], requeued: [], uncertain: [] };
  return result;
}

export async function retryTurnLater(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  turnId: string,
  input: { attempt: number; delayMs: number },
  now = new Date(),
) {
  const turn = await requireHeldTurn(db, identity, turnId, input.attempt);
  if (neverStarted(turn)) {
    await requeueTurn(db, turn, new Date(now.getTime() + input.delayMs), now);
    changed(db, turn);
    return { result: "requeued" as const };
  }
  return { result: "kept" as const };
}

export async function recoverHeldTurn(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  turnId: string,
  input: { attempt: number; unfinishedTool: boolean },
  now = new Date(),
) {
  const turn = await requireHeldTurn(db, identity, turnId, input.attempt);
  const decision = await recoverTurn(db, turn, input, identity.deviceId, now);
  changed(db, turn);
  return decision;
}
