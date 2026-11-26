import type { AgentTurnRunView } from "@substrate/contracts/agent-work/desktop";

import type { RunTransaction } from "../database.ts";
import { turnRuns } from "../schema/index.ts";
import { and, asc, desc, eq } from "drizzle-orm";

export type TurnRunRow = typeof turnRuns.$inferSelect;

export interface NewTurnRun {
  turnId: string;
  attempt: number;
  sessionId: string;
  userAgentId: string;
  epoch: number;
  envelope: string;
  prefixHash: string;
}

export function turnRunView(row: TurnRunRow): AgentTurnRunView {
  return {
    turnId: row.turnId,
    attempt: row.attempt,
    sessionId: row.sessionId,
    userAgentId: row.userAgentId,
    epoch: row.epoch,
    envelope: row.envelope,
    prefixHash: row.prefixHash,
    eventCount: row.eventCount,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

/** The attempts of server turns that this host ran, with what it sent the harness. */
export function turnRunRepository(run: RunTransaction) {
  return {
    /** Records an attempt before it runs. A retried start of the same attempt replaces its input. */
    begin: (organizationId: string, input: NewTurnRun, now: number) =>
      run((tx) =>
        tx
          .insert(turnRuns)
          .values({ organizationId, ...input, createdAt: now })
          .onConflictDoUpdate({
            target: [turnRuns.organizationId, turnRuns.turnId, turnRuns.attempt],
            set: { envelope: input.envelope, prefixHash: input.prefixHash, epoch: input.epoch },
          }),
      ),
    /** Every attempt of the turn that ran here, oldest first. */
    forTurn: (organizationId: string, turnId: string) =>
      run((tx) =>
        tx
          .select()
          .from(turnRuns)
          .where(and(eq(turnRuns.organizationId, organizationId), eq(turnRuns.turnId, turnId)))
          .orderBy(asc(turnRuns.attempt))
          .all(),
      ),
    /** The latest attempt that ran in the session. */
    latestInSession: (organizationId: string, sessionId: string) =>
      run((tx) =>
        tx
          .select()
          .from(turnRuns)
          .where(
            and(eq(turnRuns.organizationId, organizationId), eq(turnRuns.sessionId, sessionId)),
          )
          .orderBy(desc(turnRuns.createdAt), desc(turnRuns.attempt))
          .limit(1)
          .get(),
      ),
  };
}
