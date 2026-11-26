import type { HostFinishInput, HostProgressInput } from "@substrate/contracts/agent-work/control";

import { committedWrite } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import type { ResolvedDeviceIdentity } from "../../../core/session/device";
import { agentTurns } from "../turns.schema";
import { claimTurns, type ClaimOptions } from "./claim";
import { liveStatuses } from "./held-turn";
import {
  finishHeldTurn,
  progressTurn,
  recoverHeldTurn,
  retryTurnLater,
  startTurn,
} from "./lifecycle";
import { reportSteer, steerTurn, type SteerInput, type SteerResult } from "./steer";
import { submitEpoch } from "./submit";
import { hostTurns } from "./views";
import { and, eq, inArray } from "drizzle-orm";

type HostInput<T> = Omit<T, "organizationId" | "installationId">;

/** The live turns this device holds in the organization. */
async function syncTurns(db: DatabaseExecutor, identity: ResolvedDeviceIdentity) {
  const live = await db
    .select({ id: agentTurns.id })
    .from(agentTurns)
    .where(
      and(
        eq(agentTurns.leaseDeviceId, identity.deviceId),
        eq(agentTurns.organizationId, identity.organizationId),
        inArray(agentTurns.status, liveStatuses),
      ),
    );
  return hostTurns(
    db,
    live.map((turn) => turn.id),
  );
}

/** The host API of one registered device: claim, run and report turns. */
export function createHostRepository(db: DatabaseExecutor, identity: ResolvedDeviceIdentity) {
  const write = <A extends unknown[], R>(
    work: (tx: DatabaseExecutor, identity: ResolvedDeviceIdentity, ...args: A) => Promise<R>,
  ) => {
    const committed = committedWrite(work);
    return (...args: A) => committed(db, identity, ...args);
  };
  return {
    claim: write((tx, scope, options: ClaimOptions) => claimTurns(tx, scope, options)),
    sync: () => syncTurns(db, identity),
    start: write(
      (tx, scope, turnId: string, input: { attempt: number; droppedItemIds: string[] }) =>
        startTurn(tx, scope, turnId, input),
    ),
    progress: write((tx, scope, turnId: string, input: HostInput<HostProgressInput>) =>
      progressTurn(tx, scope, turnId, input),
    ),
    finish: write((tx, scope, turnId: string, input: HostInput<HostFinishInput>) =>
      finishHeldTurn(tx, scope, turnId, input),
    ),
    retryLater: write((tx, scope, turnId: string, input: { attempt: number; delayMs: number }) =>
      retryTurnLater(tx, scope, turnId, input),
    ),
    recover: write(
      (tx, scope, turnId: string, input: { attempt: number; unfinishedTool: boolean }) =>
        recoverHeldTurn(tx, scope, turnId, input),
    ),
    steer: write((tx, scope, turnId: string, input: SteerInput) =>
      steerTurn(tx, scope, turnId, input),
    ),
    steerResult: write(
      (tx, scope, itemId: string, input: { turnId: string; result: SteerResult }) =>
        reportSteer(tx, scope, itemId, input),
    ),
    submitEpoch: write((tx, scope, input: { sessionId: string; fromEpoch: number; body: string }) =>
      submitEpoch(tx, scope, input),
    ),
  };
}
