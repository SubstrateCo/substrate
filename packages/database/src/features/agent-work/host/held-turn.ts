import { liveTurnStatuses } from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../../core/executor";
import type { ResolvedDeviceIdentity } from "../../../core/session/device";
import { AccessDeniedError, ConflictError } from "../../../errors";
import { homedAgentIds } from "../device";
import { agentTurns } from "../turns.schema";
import { and, eq, inArray } from "drizzle-orm";

export type TurnRow = typeof agentTurns.$inferSelect;
export const liveStatuses = [...liveTurnStatuses];

/** A turn of one of the owner's agents that this device runs, in any status. */
export async function requireDeviceTurn(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  turnId: string,
) {
  const [turn] = await db
    .select()
    .from(agentTurns)
    .where(
      and(
        eq(agentTurns.id, turnId),
        eq(agentTurns.organizationId, identity.organizationId),
        eq(agentTurns.ownerUserId, identity.userId),
        inArray(agentTurns.userAgentId, homedAgentIds(db, identity, identity.deviceId)),
      ),
    );
  if (!turn) throw new AccessDeniedError();
  return turn;
}

/** The turn is live, in this attempt, and this device holds its lease. */
export function holds(turn: TurnRow, deviceId: string, attempt: number) {
  return (
    liveStatuses.includes(turn.status) &&
    turn.leaseDeviceId === deviceId &&
    turn.attempt === attempt
  );
}

/**
 * A live turn that this device holds in this attempt. A turn that ended, moved to another device
 * or continued as a newer attempt is a conflict: the host stops running it.
 */
export async function requireHeldTurn(
  db: DatabaseExecutor,
  identity: ResolvedDeviceIdentity,
  turnId: string,
  attempt: number,
) {
  const turn = await requireDeviceTurn(db, identity, turnId);
  if (!holds(turn, identity.deviceId, attempt))
    throw new ConflictError("This device no longer runs this turn.");
  return turn;
}
