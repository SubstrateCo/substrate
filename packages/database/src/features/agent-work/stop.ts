import { helperMachine, turnMachine, type TurnInterruption } from "@substrate/contracts/agent-work";
import { realtimeKeys } from "@substrate/contracts/realtime";

import { effectsFor } from "../../core/effects";
import type { DatabaseExecutor } from "../../core/executor";
import { agentHelpers } from "./helpers.schema";
import { liveStatuses, type TurnRow } from "./host/held-turn";
import { neverStarted, requeueTurn } from "./host/recovery";
import { claimableStatuses, setItemStatus } from "./items";
import { inStates } from "./machine-sql";
import { agentRoutines } from "./routines.schema";
import { agentTurns } from "./turns.schema";
import { agentWorkItems } from "./work-items.schema";
import { and, eq, inArray, ne, type SQL } from "drizzle-orm";

export async function stopTurns(
  db: DatabaseExecutor,
  where: SQL | undefined,
  interruption: TurnInterruption,
) {
  const stopped = await db
    .update(agentTurns)
    .set({ status: turnMachine.events.stop.to, interruption })
    .where(
      and(
        where,
        inStates(agentTurns.status, turnMachine.from("stop")),
        ne(agentTurns.status, "stopping"),
      ),
    )
    .returning();
  for (const userId of new Set(stopped.map((turn) => turn.ownerUserId)))
    effectsFor(db).hint({ audience: realtimeKeys.user(userId), domain: "agent-work" });
  return stopped;
}

export async function endAgentTurns(db: DatabaseExecutor, userAgentId: string, now = new Date()) {
  const live: TurnRow[] = await db
    .select()
    .from(agentTurns)
    .where(and(eq(agentTurns.userAgentId, userAgentId), inArray(agentTurns.status, liveStatuses)));
  const waiting = live.filter(neverStarted);
  for (const turn of waiting) await requeueTurn(db, turn, now, now);
  const started = live.filter((turn) => !waiting.includes(turn));
  if (started.length)
    await stopTurns(
      db,
      inArray(
        agentTurns.id,
        started.map((turn) => turn.id),
      ),
      "stop",
    );
  if (live.length)
    effectsFor(db).hint({
      audience: realtimeKeys.user(live[0]!.ownerUserId),
      domain: "agent-work",
    });
  return live.length;
}

export async function endDeletedAgentWork(
  db: DatabaseExecutor,
  userAgentId: string,
  now = new Date(),
) {
  await endAgentTurns(db, userAgentId, now);
  const open = await db
    .select({ id: agentWorkItems.id })
    .from(agentWorkItems)
    .where(
      and(
        eq(agentWorkItems.userAgentId, userAgentId),
        inArray(agentWorkItems.status, claimableStatuses),
      ),
    );
  await setItemStatus(
    db,
    open.map((item) => item.id),
    "drop",
    { reason: "agent_deleted" },
  );
  const attention = await db
    .update(agentTurns)
    .set({ status: turnMachine.events.dismiss.to, finishedAt: now })
    .where(
      and(
        eq(agentTurns.userAgentId, userAgentId),
        inStates(agentTurns.status, turnMachine.from("dismiss")),
      ),
    )
    .returning({ id: agentTurns.id });
  if (attention.length) {
    const held = await db
      .select({ id: agentWorkItems.id })
      .from(agentWorkItems)
      .where(
        and(
          inArray(
            agentWorkItems.turnId,
            attention.map((turn) => turn.id),
          ),
          inArray(agentWorkItems.status, ["submitted", "uncertain"]),
        ),
      );
    await setItemStatus(
      db,
      held.map((item) => item.id),
      "dismiss",
      { reason: "agent_deleted" },
    );
  }
  await db
    .update(agentHelpers)
    .set({ status: helperMachine.events.stop.to, finishedAt: now })
    .where(
      and(
        eq(agentHelpers.userAgentId, userAgentId),
        inStates(agentHelpers.status, helperMachine.from("stop")),
      ),
    );
  await db
    .update(agentRoutines)
    .set({ enabled: false, updatedAt: now })
    .where(eq(agentRoutines.userAgentId, userAgentId));
}
