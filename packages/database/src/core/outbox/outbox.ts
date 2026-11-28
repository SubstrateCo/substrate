import type { RealtimeHint } from "@substrate/contracts/realtime";

import type { DatabaseExecutor } from "../executor";
import { realtimeOutbox, type RealtimeChange } from "./schema";
import { eq, gte, lt, or, sql } from "drizzle-orm";

export interface OutboxBatch {
  id: string;
  changes: RealtimeChange[];
}

export const outboxMaxAttempts = 12;

const outboxMaxAge = "15 minutes";

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

export async function finishOutbox(db: DatabaseExecutor, id: string) {
  await db.delete(realtimeOutbox).where(eq(realtimeOutbox.id, id));
}
