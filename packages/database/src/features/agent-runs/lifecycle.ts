import type { DatabaseExecutor } from "../../client";
import { agentRunRequests, agentRuns } from "./schema";
import { and, eq, inArray, lt, sql } from "drizzle-orm";

/** Harness requests wait 10 minutes; the native adapter gives up at the same time. */
export const requestTimeout = sql`interval '10 minutes'`;
export const leaseSeconds = 60;

/**
 * Applies time-based transitions for one owner. Runs and requests change state only here and in
 * explicit actions, so readers call this first instead of computing states on every query.
 */
export async function sweepRuns(db: DatabaseExecutor, ownerUserId: string) {
  const now = sql`now()`;
  await db
    .update(agentRuns)
    .set({
      status: "expired",
      finishedAt: now,
      error: "The agent's device did not start this run within 24 hours.",
    })
    .where(
      and(
        eq(agentRuns.ownerUserId, ownerUserId),
        eq(agentRuns.status, "queued"),
        lt(agentRuns.expiresAt, now),
      ),
    );
  await db
    .update(agentRuns)
    .set({
      status: "failed",
      finishedAt: now,
      leaseExpiresAt: null,
      error: "The agent's device stopped responding.",
    })
    .where(
      and(
        eq(agentRuns.ownerUserId, ownerUserId),
        eq(agentRuns.status, "running"),
        lt(agentRuns.leaseExpiresAt, now),
      ),
    );
  const owned = db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.ownerUserId, ownerUserId));
  await db
    .update(agentRunRequests)
    .set({ status: "expired", resolvedAt: now })
    .where(
      and(
        inArray(agentRunRequests.runId, owned),
        eq(agentRunRequests.status, "pending"),
        sql`${agentRunRequests.createdAt} < now() - ${requestTimeout}`,
      ),
    );
}

/** A finished run cannot answer: its harness callbacks are gone. */
export async function cancelOpenRequests(db: DatabaseExecutor, runId: string) {
  await db
    .update(agentRunRequests)
    .set({ status: "cancelled", resolvedAt: sql`now()` })
    .where(and(eq(agentRunRequests.runId, runId), eq(agentRunRequests.status, "pending")));
}
