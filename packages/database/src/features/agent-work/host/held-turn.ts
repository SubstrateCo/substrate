import { liveTurnStatuses } from "@substrate/contracts/agent-work";

import type { DatabaseExecutor } from "../../../core/executor";
import type { ResolvedDeviceIdentity } from "../../../core/session/device";
import { AccessDeniedError, ConflictError } from "../../../errors";
import { homedAgentIds } from "../device";
import { agentTurns } from "../turns.schema";
import { and, eq, inArray } from "drizzle-orm";

export type TurnRow = typeof agentTurns.$inferSelect;
export const liveStatuses = [...liveTurnStatuses];

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

export function holds(turn: TurnRow, deviceId: string, attempt: number) {
  return (
    liveStatuses.includes(turn.status) &&
    turn.leaseDeviceId === deviceId &&
    turn.attempt === attempt
  );
}

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
