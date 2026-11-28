import { realtimeKeys } from "@substrate/contracts/realtime";

import { userAgents } from "../../../core/actors/user-agents.schema";
import { effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import { agentTurns } from "../turns.schema";
import { liveStatuses } from "./held-turn";
import { leaseGraceMs, leaseUntil } from "./lease-time";
import { endLostTurn } from "./recovery";
import { and, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";

export async function renewLeases(db: DatabaseExecutor, deviceId: string, now = new Date()) {
  await db
    .update(agentTurns)
    .set({ leaseExpiresAt: leaseUntil(now) })
    .where(and(eq(agentTurns.leaseDeviceId, deviceId), inArray(agentTurns.status, liveStatuses)));
}

function hint(db: DatabaseExecutor, ownerUserIds: Iterable<string>) {
  for (const userId of new Set(ownerUserIds))
    effectsFor(db).hint({ audience: realtimeKeys.user(userId), domain: "agent-work" });
}

export async function sweepExpiredLeases(
  db: DatabaseExecutor,
  now = new Date(),
  scope: { ownerUserId?: string; limit?: number } = {},
) {
  const graceEnd = new Date(now.getTime() - leaseGraceMs);
  const rows = await db
    .select({ turn: agentTurns, homeDeviceId: userAgents.homeDeviceId })
    .from(agentTurns)
    .innerJoin(userAgents, eq(userAgents.id, agentTurns.userAgentId))
    .where(
      and(
        inArray(agentTurns.status, liveStatuses),
        isNotNull(agentTurns.leaseExpiresAt),
        lt(agentTurns.leaseExpiresAt, now),
        or(
          sql`${userAgents.homeDeviceId} IS DISTINCT FROM ${agentTurns.leaseDeviceId}`,
          lt(agentTurns.leaseExpiresAt, graceEnd),
        ),
        scope.ownerUserId ? eq(agentTurns.ownerUserId, scope.ownerUserId) : undefined,
      ),
    )
    .limit(scope.limit ?? 100);
  for (const { turn, homeDeviceId } of rows)
    await endLostTurn(db, turn, homeDeviceId === turn.leaseDeviceId ? "app" : "moved", now);
  hint(
    db,
    rows.map(({ turn }) => turn.ownerUserId),
  );
  return rows.length;
}

export async function endMovedLeases(
  db: DatabaseExecutor,
  userAgentId: string,
  homeDeviceId: string,
  now = new Date(),
) {
  const turns = await db
    .select()
    .from(agentTurns)
    .where(
      and(
        eq(agentTurns.userAgentId, userAgentId),
        inArray(agentTurns.status, liveStatuses),
        sql`${agentTurns.leaseDeviceId} IS DISTINCT FROM ${homeDeviceId}`,
      ),
    );
  for (const turn of turns) await endLostTurn(db, turn, "moved", now);
  if (turns.length) hint(db, [turns[0]!.ownerUserId]);
  return turns.length;
}
