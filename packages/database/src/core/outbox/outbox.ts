import type { RealtimeHint } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../executor";
import { realtimeOutbox, type RealtimeChange } from "./schema";
import { eq, gte, lt, or, sql } from "drizzle-orm";

/** A batch waiting for publication. */
export interface OutboxBatch {
  id: string;
  changes: RealtimeChange[];
}

/** After this many relay attempts, a batch is dropped. Clients recover on their next re-read. */
export const outboxMaxAttempts = 12;

/**
 * Batches older than this are dropped, which bounds the table during a long outage. Such an outage
 * also drops the realtime subscription and its sockets, and reconnecting clients resync, so these
 * hints no longer add anything.
 */
const outboxMaxAge = "15 minutes";

/** Gives each hint its event ID and stores the batch until it is published. */
export async function recordOutbox(
  db: DatabaseExecutor,
  hints: readonly RealtimeHint[],
): Promise<OutboxBatch | undefined> {
  if (!hints.length) return undefined;
  const changes = hints.map((hint) => ({ ...hint, id: crypto.randomUUID() }));
  const [row] = await db
    .insert(realtimeOutbox)
    .values({ changes })
    .returning({ id: realtimeOutbox.id });
  return { id: row!.id, changes };
}

/**
 * Claims due batches for the relay. Each claim counts an attempt and moves the next one back, so
 * a relay that stops mid-publish does not block the batch, and concurrent relays skip it.
 */
export const outboxClaimLimit = 100;

export async function claimOutbox(
  db: DatabaseExecutor,
  limit = outboxClaimLimit,
): Promise<OutboxBatch[]> {
  await db
    .delete(realtimeOutbox)
    .where(
      or(
        gte(realtimeOutbox.attempts, outboxMaxAttempts),
        lt(realtimeOutbox.createdAt, sql`now() - ${outboxMaxAge}::interval`),
      ),
    );
  const rows = await db.execute<{ id: string; changes: RealtimeChange[] }>(sql`
    WITH due AS (
      SELECT ${realtimeOutbox.id} AS id FROM ${realtimeOutbox}
      WHERE ${realtimeOutbox.nextAttemptAt} <= now()
        AND ${realtimeOutbox.attempts} < ${outboxMaxAttempts}
      ORDER BY ${realtimeOutbox.createdAt}
      FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE ${realtimeOutbox}
    SET attempts = ${realtimeOutbox.attempts} + 1,
      next_attempt_at = now() + least(300, 5 * power(2, ${realtimeOutbox.attempts})) * interval '1 second'
    FROM due WHERE ${realtimeOutbox.id} = due.id
    RETURNING ${realtimeOutbox.id} AS id, ${realtimeOutbox.changes} AS changes
  `);
  return [...rows];
}

/** Deletes a published batch. */
export async function finishOutbox(db: DatabaseExecutor, id: string) {
  await db.delete(realtimeOutbox).where(eq(realtimeOutbox.id, id));
}
