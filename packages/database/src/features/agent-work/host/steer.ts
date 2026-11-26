import {
  inboxItemMachine,
  triggerRegistry,
  type InboxStatus,
} from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { ResolvedDeviceIdentity } from "../../../core/session/device";
import { AccessDeniedError } from "../../../errors";
import { claimableStatuses, setItemStatus, steerableSources, type ItemRow } from "../items";
import { inStates } from "../machine-sql";
import { folderKey, type SessionRow } from "../sessions";
import { agentSessions } from "../sessions.schema";
import { agentWorkItems } from "../work-items.schema";
import { requireDeviceTurn, requireHeldTurn, type TurnRow } from "./held-turn";
import { settleUncertainTurn } from "./uncertain";
import { hostItems } from "./views";
import { and, eq, inArray, lte } from "drizzle-orm";

export interface SteerInput {
  attempt: number;
  harnessCanSteer: boolean;
  awaitingRequestIds: string[];
}

/**
 * Whether a waiting item joins the live turn with steer. It does not join a turn whose session
 * the owner reset since the turn started: it waits for the fresh session.
 */
function joins(
  turn: TurnRow,
  item: ItemRow,
  session: SessionRow,
  input: SteerInput,
  rotating: boolean,
) {
  const ref = item.sourceRef;
  return (
    triggerRegistry[item.source].steerable &&
    (ref.source !== "thread_context" || ref.targetTurnId === turn.id) &&
    item.sessionId === turn.sessionId &&
    session.resetGeneration === turn.resetGeneration &&
    item.status === "pending" &&
    turn.kind === "interactive" &&
    input.harnessCanSteer &&
    !turn.handoff &&
    !rotating &&
    turn.status !== "stopping" &&
    !(ref.source === "approval_result" && input.awaitingRequestIds.includes(ref.requestId))
  );
}

/**
 * Owner items whose slot this live turn holds. Steerable items of the turn's own session join
 * an interactive turn that is not stopping or handing its epoch off, when the harness can steer;
 * they are recorded as steered into the turn before the host sends them, so that the turn's end
 * and early consumption evidence both see them. The others wait, held, until the slot frees or
 * the owner sends them now. Passive context that cannot join is dropped.
 */
export async function steerTurn(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  turnId: string,
  input: SteerInput,
  now = new Date(),
) {
  const turn = await requireHeldTurn(db, identity, turnId, input.attempt);
  const rows = await db
    .select({ item: agentWorkItems, session: agentSessions })
    .from(agentWorkItems)
    .innerJoin(agentSessions, eq(agentSessions.id, agentWorkItems.sessionId))
    .where(
      and(
        eq(agentWorkItems.userAgentId, turn.userAgentId),
        eq(agentWorkItems.organizationId, turn.organizationId),
        inArray(agentWorkItems.source, steerableSources),
        inArray(agentWorkItems.status, claimableStatuses),
        lte(agentWorkItems.availableAt, now),
      ),
    )
    .orderBy(agentWorkItems.availableAt, agentWorkItems.id);
  const waiting = rows.filter(({ session }) => folderKey(session) === turn.folderKey);
  // An epoch handoff waits for this session: nothing more joins the old epoch.
  const [rotation] = await db
    .select({ id: agentWorkItems.id })
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.sessionId, turn.sessionId),
        eq(agentWorkItems.source, "epoch"),
        inArray(agentWorkItems.status, claimableStatuses),
      ),
    )
    .limit(1);
  const steered: string[] = [];
  const hold: string[] = [];
  const passive: string[] = [];
  for (const { item, session } of waiting) {
    if (joins(turn, item, session, input, Boolean(rotation))) {
      const [submitted] = await db
        .update(agentWorkItems)
        .set({
          status: inboxItemMachine.events.submit.to,
          steered: true,
          held: false,
          turnId: turn.id,
        })
        .where(
          and(
            eq(agentWorkItems.id, item.id),
            eq(agentWorkItems.status, "pending"),
            inStates(agentWorkItems.status, inboxItemMachine.from("submit")),
          ),
        )
        .returning({ id: agentWorkItems.id });
      if (submitted) steered.push(submitted.id);
    } else if (item.source === "thread_context") passive.push(item.id);
    else if (!item.held) hold.push(item.id);
  }
  await setItemStatus(db, passive, "drop", { reason: "not_steerable" });
  if (hold.length)
    await db
      .update(agentWorkItems)
      .set({ held: true })
      .where(
        and(inArray(agentWorkItems.id, hold), inArray(agentWorkItems.status, claimableStatuses)),
      );
  if (steered.length || hold.length)
    effectsFor(db).hint({ audience: realtimeKeys.user(turn.ownerUserId), domain: "agent-work" });
  const items = steered.length
    ? await db.select().from(agentWorkItems).where(inArray(agentWorkItems.id, steered))
    : [];
  return {
    items: await hostItems(db, items),
    waiting: waiting.some(
      ({ item }) => item.source !== "thread_context" && !steered.includes(item.id),
    ),
  };
}

export type SteerResult = "delivered" | "undelivered" | "uncertain" | "inaccessible";

/**
 * What happened to an item the host steered into a turn. undelivered: the steer proved the
 * harness did not take it, so it waits again. uncertain: it is never sent again by itself; the
 * owner resends or discards it. inaccessible: its source became hidden, so it is dropped.
 */
export async function reportSteer(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  itemId: string,
  input: { turnId: string; result: SteerResult },
  now = new Date(),
): Promise<{ status: InboxStatus | null }> {
  const turn = await requireDeviceTurn(db, identity, input.turnId);
  const mine = and(
    eq(agentWorkItems.id, itemId),
    eq(agentWorkItems.turnId, turn.id),
    eq(agentWorkItems.steered, true),
  );
  const [item] = await db.select().from(agentWorkItems).where(mine);
  if (!item) throw new AccessDeniedError();
  if (input.result === "undelivered") {
    await db
      .update(agentWorkItems)
      .set({
        status: inboxItemMachine.events.revertSteer.to,
        steered: false,
        turnId: null,
        reason: null,
      })
      .where(and(mine, inStates(agentWorkItems.status, inboxItemMachine.from("revertSteer"))));
    await settleUncertainTurn(db, turn.id, now);
  } else if (input.result === "uncertain")
    await db
      .update(agentWorkItems)
      .set({
        status: inboxItemMachine.events.unconfirm.to,
        held: false,
        reason: "steer_unconfirmed",
      })
      .where(and(mine, inStates(agentWorkItems.status, inboxItemMachine.from("unconfirm"))));
  else if (input.result === "inaccessible") {
    await setItemStatus(db, [item.id], "drop", { reason: "source_inaccessible" });
    await settleUncertainTurn(db, turn.id, now);
  }
  if (input.result !== "delivered")
    effectsFor(db).hint({ audience: realtimeKeys.user(turn.ownerUserId), domain: "agent-work" });
  const [current] = await db
    .select({ status: agentWorkItems.status })
    .from(agentWorkItems)
    .where(eq(agentWorkItems.id, itemId));
  return { status: current?.status ?? null };
}
