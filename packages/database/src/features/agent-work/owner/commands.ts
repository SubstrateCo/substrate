import {
  inboxItemMachine,
  liveTurnStatuses,
  triggerRegistry,
  turnMachine,
  type AgentSessionResetReason,
} from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { userAgents } from "../../../core/actors/user-agents.schema";
import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { SessionIdentity } from "../../../core/session/identity";
import {
  AccessDeniedError,
  ConflictError,
  ValidationError,
  violatedConstraint,
} from "../../../errors";
import { homeDeviceOf } from "../home";
import { settleHelper } from "../host/finish";
import { liveStatuses, type TurnRow } from "../host/held-turn";
import { leaseUntil } from "../host/lease-time";
import { settleUncertainTurn } from "../host/uncertain";
import { claimableStatuses, setItemStatus } from "../items";
import { inStates } from "../machine-sql";
import { folderKey, setSessionStatus } from "../sessions";
import { agentSessions } from "../sessions.schema";
import { visibleAmong } from "../status";
import { stopTurns } from "../stop";
import { agentTurns } from "../turns.schema";
import { agentWorkItems } from "../work-items.schema";
import { ownedBy } from "./views";
import { and, eq, inArray, ne, sql } from "drizzle-orm";

const busy = "The agent is busy. Try again when it finishes.";

function changed(db: DatabaseExecutor, identity: SessionIdentity) {
  effectsFor(db).hint({ audience: realtimeKeys.user(identity.userId), domain: "agent-work" });
}

async function ownedTurn(db: DatabaseExecutor, identity: SessionIdentity, turnId: string) {
  const [turn] = await db
    .select()
    .from(agentTurns)
    .where(and(eq(agentTurns.id, turnId), ownedBy(agentTurns, identity)));
  if (!turn) throw new AccessDeniedError();
  return turn;
}

async function attentionTurn(db: DatabaseExecutor, identity: SessionIdentity, turnId: string) {
  const turn = await ownedTurn(db, identity, turnId);
  if (turn.status !== "needs_attention") throw new ConflictError("This work does not need you.");
  return turn;
}

export async function ownedItem(db: DatabaseExecutor, identity: SessionIdentity, itemId: string) {
  const [item] = await db
    .select()
    .from(agentWorkItems)
    .where(and(eq(agentWorkItems.id, itemId), ownedBy(agentWorkItems, identity)));
  if (!item) throw new AccessDeniedError();
  return item;
}

export async function stopTurn(db: DatabaseExecutor, identity: SessionIdentity, turnId: string) {
  const turn = await ownedTurn(db, identity, turnId);
  if (!liveTurnStatuses.includes(turn.status)) throw new ConflictError("This turn has ended.");
  await stopTurns(db, eq(agentTurns.id, turn.id), "stop");
  changed(db, identity);
}

async function rerun(db: DatabaseExecutor, turn: TurnRow, now: Date, resetGeneration?: number) {
  const [agent] = await db
    .select({ enabled: userAgents.enabled })
    .from(userAgents)
    .where(eq(userAgents.id, turn.userAgentId));
  if (!agent?.enabled) throw new ValidationError("Turn the agent on first.");
  const home = await homeDeviceOf(db, turn.userAgentId);
  if (!home) throw new ValidationError("Choose a desktop to run this agent first.");
  const [live] = await db
    .select({ id: agentTurns.id })
    .from(agentTurns)
    .where(
      and(
        eq(agentTurns.folderKey, turn.folderKey),
        inArray(agentTurns.status, liveStatuses),
        ne(agentTurns.id, turn.id),
      ),
    )
    .limit(1);
  if (live) throw new ConflictError(busy);
  const values: Partial<typeof agentTurns.$inferInsert> = {
    status: turnMachine.events.retry.to,
    attempt: turn.attempt + 1,
    generation: turn.generation + 1,
    attentionReason: null,
    error: null,
    finishedAt: null,
    leaseDeviceId: home,
    leaseExpiresAt: leaseUntil(now),
  };
  if (resetGeneration !== undefined) values.resetGeneration = resetGeneration;
  const retried = await db
    .update(agentTurns)
    .set(values)
    .where(
      and(
        eq(agentTurns.id, turn.id),
        eq(agentTurns.attempt, turn.attempt),
        inStates(agentTurns.status, turnMachine.from("retry")),
      ),
    )
    .returning({ id: agentTurns.id })
    .catch((error: Error) => {
      if (violatedConstraint(error) === "agent_turns_live_folder_unique")
        throw new ConflictError(busy);
      throw error;
    });
  if (!retried.length) throw new ConflictError("This work does not need you.");
  await setSessionStatus(db, turn.sessionId, "work", now);
}

export async function retryTurn(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  turnId: string,
  now = new Date(),
) {
  const turn = await attentionTurn(db, identity, turnId);
  const kept = await db
    .select({ id: agentWorkItems.id })
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.turnId, turn.id),
        eq(agentWorkItems.status, "submitted"),
        eq(agentWorkItems.steered, false),
      ),
    )
    .limit(1);
  if (turn.attentionReason === "uncertain_input" && !kept.length) {
    await db
      .update(agentWorkItems)
      .set({
        status: inboxItemMachine.events.resend.to,
        steered: false,
        held: false,
        turnId: null,
        reason: null,
        availableAt: now,
        deadlineAt: now,
      })
      .where(
        and(
          eq(agentWorkItems.turnId, turn.id),
          inStates(agentWorkItems.status, inboxItemMachine.from("resend")),
        ),
      );
    await settleUncertainTurn(db, turn.id, now);
  } else await rerun(db, turn, now);
  changed(db, identity);
}

export async function dismissTurn(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  turnId: string,
  now = new Date(),
) {
  const turn = await attentionTurn(db, identity, turnId);
  const dismissed = await db
    .update(agentTurns)
    .set({ status: turnMachine.events.dismiss.to, finishedAt: now })
    .where(
      and(eq(agentTurns.id, turn.id), inStates(agentTurns.status, turnMachine.from("dismiss"))),
    )
    .returning({ id: agentTurns.id });
  if (!dismissed.length) throw new ConflictError("This work does not need you.");
  const items = await db
    .select({ id: agentWorkItems.id })
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.turnId, turn.id),
        inArray(agentWorkItems.status, ["submitted", "uncertain"]),
      ),
    );
  await setItemStatus(
    db,
    items.map((item) => item.id),
    "dismiss",
    { reason: "dismissed" },
  );
  await settleHelper(db, turn, "cancelled", now);
  changed(db, identity);
}

async function resetSessions(
  db: DatabaseExecutor,
  ids: string[],
  reason: AgentSessionResetReason,
  now: Date,
) {
  return db
    .update(agentSessions)
    .set({
      resetGeneration: sql`${agentSessions.resetGeneration} + 1`,
      resetReason: reason,
      updatedAt: now,
    })
    .where(inArray(agentSessions.id, ids))
    .returning({ id: agentSessions.id, resetGeneration: agentSessions.resetGeneration });
}

export async function startFresh(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  turnId: string,
  now = new Date(),
) {
  const turn = await attentionTurn(db, identity, turnId);
  const [session] = await resetSessions(db, [turn.sessionId], "start_fresh", now);
  await rerun(db, turn, now, session!.resetGeneration);
  changed(db, identity);
}

export async function sendNow(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  itemId: string,
  now = new Date(),
) {
  const item = await ownedItem(db, identity, itemId);
  if (!triggerRegistry[item.source].canStartTurn)
    throw new ValidationError("Context updates cannot interrupt work.");
  const deadlineAt = item.deadlineAt > now ? item.deadlineAt : now;
  const [moved] = await db
    .update(agentWorkItems)
    .set({ held: false, availableAt: now, deadlineAt })
    .where(and(eq(agentWorkItems.id, item.id), inArray(agentWorkItems.status, claimableStatuses)))
    .returning({ id: agentWorkItems.id });
  if (!moved) throw new ConflictError("This item no longer waits.");
  const [session] = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, item.sessionId));
  const [stopped] = await stopTurns(
    db,
    and(eq(agentTurns.folderKey, folderKey(session!)), inArray(agentTurns.status, liveStatuses)),
    "owner",
  );
  changed(db, identity);
  return stopped?.id ?? null;
}

export async function resendItem(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  itemId: string,
  now = new Date(),
) {
  const item = await ownedItem(db, identity, itemId);
  const [resent] = await db
    .update(agentWorkItems)
    .set({
      status: inboxItemMachine.events.resend.to,
      steered: false,
      held: false,
      turnId: null,
      reason: null,
      availableAt: now,
      deadlineAt: now,
    })
    .where(
      and(
        eq(agentWorkItems.id, item.id),
        inStates(agentWorkItems.status, inboxItemMachine.from("resend")),
      ),
    )
    .returning({ id: agentWorkItems.id });
  if (!resent) throw new ConflictError("This item is not uncertain.");
  if (item.turnId) await settleUncertainTurn(db, item.turnId, now);
  changed(db, identity);
}

export async function discardItem(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  itemId: string,
  now = new Date(),
) {
  const item = await ownedItem(db, identity, itemId);
  const discarded = await setItemStatus(db, [item.id], "discard", {
    reason: "discarded",
    held: false,
  });
  if (!discarded.length) throw new ConflictError("This item is not uncertain.");
  if (item.turnId) await settleUncertainTurn(db, item.turnId, now);
  changed(db, identity);
}

export async function newTopic(
  db: DatabaseExecutor,
  identity: SessionIdentity,
  conversationId: string,
  now = new Date(),
) {
  if (!(await visibleAmong(db, identity, [conversationId])).size) throw new AccessDeniedError();
  const sessions = await db
    .select({ id: agentSessions.id })
    .from(agentSessions)
    .where(
      and(
        ownedBy(agentSessions, identity),
        eq(agentSessions.kind, "dm"),
        eq(agentSessions.originConversationId, conversationId),
      ),
    );
  if (!sessions.length) throw new ValidationError("No agent works in this conversation.");
  const reset = await resetSessions(
    db,
    sessions.map((session) => session.id),
    "new_topic",
    now,
  );
  changed(db, identity);
  return reset.map((session) => session.id);
}
