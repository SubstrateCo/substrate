import type { TurnEventData, TurnEventKind, TurnEventView } from "@substrate/contracts/agent-work";

import type { RunTransaction } from "../database.ts";
import { turnEvents, turnRuns } from "../schema/index.ts";
import { and, asc, eq, gt, inArray, max } from "drizzle-orm";

export type NewTurnEvent = {
  [K in TurnEventKind]: { kind: K; data: TurnEventData[K]; itemId?: string | null };
}[TurnEventKind];

type TurnEventRow = typeof turnEvents.$inferSelect;

function eventView(row: TurnEventRow): TurnEventView {
  // SAFETY: rows are written only by append, which pairs each kind with its data shape.
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

const ofTurn = (organizationId: string, turnId: string) =>
  and(eq(turnEvents.organizationId, organizationId), eq(turnEvents.turnId, turnId));

export function eventRepository(run: RunTransaction) {
  return {
    /**
     * Appends events to an attempt with the next sequence numbers of the turn, so that the
     * numbers have no gaps across attempts.
     */
    append: (
      organizationId: string,
      turn: { turnId: string; attempt: number },
      events: NewTurnEvent[],
      now: number,
    ) =>
      run(async (tx) => {
        if (!events.length) return [];
        const attempt = and(
          eq(turnRuns.organizationId, organizationId),
          eq(turnRuns.turnId, turn.turnId),
          eq(turnRuns.attempt, turn.attempt),
        );
        const runRow = await tx
          .select({ eventCount: turnRuns.eventCount })
          .from(turnRuns)
          .where(attempt)
          .get();
        if (!runRow) throw new Error("Turn attempt not found.");
        const last = await tx
          .select({ seq: max(turnEvents.seq) })
          .from(turnEvents)
          .where(ofTurn(organizationId, turn.turnId))
          .get();
        const start = last?.seq ?? 0;
        const rows = events.map((event, index) => ({
          organizationId,
          turnId: turn.turnId,
          seq: start + index + 1,
          attempt: turn.attempt,
          kind: event.kind,
          itemId: event.itemId ?? null,
          data: event.data,
          createdAt: now,
        }));
        await tx.insert(turnEvents).values(rows);
        await tx
          .update(turnRuns)
          .set({ eventCount: runRow.eventCount + events.length })
          .where(attempt);
        return rows.map(eventView);
      }),
    /** Events with seq greater than after, oldest first. */
    list: (organizationId: string, turnId: string, after = 0, limit = 1000) =>
      run(async (tx) =>
        (
          await tx
            .select()
            .from(turnEvents)
            .where(and(ofTurn(organizationId, turnId), gt(turnEvents.seq, after)))
            .orderBy(asc(turnEvents.seq))
            .limit(limit)
            .all()
        ).map(eventView),
      ),
    /** Every event of the turn with one of these kinds, oldest first. */
    ofKinds: <K extends TurnEventKind>(organizationId: string, turnId: string, kinds: K[]) =>
      run(async (tx) =>
        (
          await tx
            .select()
            .from(turnEvents)
            .where(and(ofTurn(organizationId, turnId), inArray(turnEvents.kind, kinds)))
            .orderBy(asc(turnEvents.seq))
            .all()
        ).map(
          // SAFETY: the query returns only rows of the requested kinds.
          (row) => eventView(row) as Extract<TurnEventView, { kind: K }>,
        ),
      ),
    unfinishedTool: (organizationId: string, turn: { turnId: string; attempt: number }) =>
      run(async (tx) => {
        const rows = await tx
          .select({ kind: turnEvents.kind, itemId: turnEvents.itemId })
          .from(turnEvents)
          .where(
            and(
              ofTurn(organizationId, turn.turnId),
              eq(turnEvents.attempt, turn.attempt),
              inArray(turnEvents.kind, ["tool_started", "tool_completed"]),
            ),
          )
          .orderBy(asc(turnEvents.seq))
          .all();
        const started = new Set(
          rows.filter((row) => row.kind === "tool_started").map((row) => row.itemId),
        );
        for (const row of rows) if (row.kind === "tool_completed") started.delete(row.itemId);
        return started.size > 0;
      }),
  };
}
