import type { TurnEventData, TurnEventKind, TurnEventView } from "@startup-os/contracts/agent-work";

import type { LocalTransaction, RunTransaction } from "../database.ts";
import { turnEvents, turns } from "../schema/index.ts";
import { and, asc, eq, gt } from "drizzle-orm";

export type NewTurnEvent = {
  [K in TurnEventKind]: { kind: K; data: TurnEventData[K]; itemId?: string | null };
}[TurnEventKind];

const activityMaxLength = 200;

/**
 * Appends events with the next sequence numbers of the turn, in the caller's transaction, so
 * that the numbers have no gaps. Tool starts also update the turn's activity line, and usage
 * events its latest usage.
 */
export async function appendEvents(
  tx: LocalTransaction,
  turnId: string,
  events: NewTurnEvent[],
  now: number,
) {
  if (!events.length) return [];
  const turn = await tx
    .select({ eventCount: turns.eventCount, attempt: turns.attempt })
    .from(turns)
    .where(eq(turns.id, turnId))
    .get();
  if (!turn) throw new Error("Turn not found.");
  const rows = events.map((event, index) => ({
    turnId,
    seq: turn.eventCount + index + 1,
    attempt: turn.attempt,
    kind: event.kind,
    itemId: event.itemId ?? null,
    data: event.data,
    createdAt: now,
  }));
  await tx.insert(turnEvents).values(rows);
  let activity: string | undefined;
  for (const event of events) {
    if (event.kind === "tool_started" || event.kind === "activity")
      activity = (event.kind === "tool_started" ? event.data.title : event.data.text).slice(
        0,
        activityMaxLength,
      );
  }
  const changes: Partial<typeof turns.$inferInsert> = {
    eventCount: turn.eventCount + events.length,
  };
  if (activity) changes.activity = activity;
  for (const event of events) if (event.kind === "usage") changes.usage = event.data.usage;
  await tx.update(turns).set(changes).where(eq(turns.id, turnId));
  return rows;
}

type TurnEventRow = typeof turnEvents.$inferSelect;

function eventView(row: TurnEventRow): TurnEventView {
  // SAFETY: rows are written only by appendEvents, which pairs each kind with its data shape.
  return {
    turnId: row.turnId,
    seq: row.seq,
    attempt: row.attempt,
    kind: row.kind,
    itemId: row.itemId,
    data: row.data,
    createdAt: new Date(row.createdAt).toISOString(),
  } as TurnEventView;
}

export function eventRepository(run: RunTransaction) {
  return {
    append: (turnId: string, events: NewTurnEvent[], now: number) =>
      run((tx) => appendEvents(tx, turnId, events, now)),
    /** Events with seq greater than after, oldest first. */
    list: (turnId: string, after = 0, limit = 1000) =>
      run(async (tx) =>
        (
          await tx
            .select()
            .from(turnEvents)
            .where(and(eq(turnEvents.turnId, turnId), gt(turnEvents.seq, after)))
            .orderBy(asc(turnEvents.seq))
            .limit(limit)
            .all()
        ).map(eventView),
      ),
  };
}
