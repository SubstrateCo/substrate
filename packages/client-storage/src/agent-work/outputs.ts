import { wakeDedupePrefixes } from "@substrate/contracts/agent-work";

import type { RunTransaction } from "../database.ts";
import { inbox, outputs, turns } from "../schema/index.ts";
import { appendEvents, type NewTurnEvent } from "./events.ts";
import { and, eq, inArray, notExists, or, sql } from "drizzle-orm";

export type OutputRow = typeof outputs.$inferSelect;

export type NewOutput =
  | { kind: "message"; id: string; conversationId: string; threadId: string | null }
  | { kind: "task"; id: string }
  | { kind: "request"; id: string; requestKind: "question" | "proposal" };

export function outputRepository(run: RunTransaction) {
  return {
    /** Records the output and appends the turn's events for it in the same transaction. */
    record: (turnId: string, output: NewOutput, now: number, events: NewTurnEvent[] = []) =>
      run(async (tx) => {
        await tx
          .insert(outputs)
          .values({
            turnId,
            targetKind: output.kind,
            targetId: output.id,
            conversationId: output.kind === "message" ? output.conversationId : null,
            threadId: output.kind === "message" ? output.threadId : null,
            requestKind: output.kind === "request" ? output.requestKind : null,
            createdAt: now,
          })
          .onConflictDoNothing();
        await appendEvents(tx, turnId, events, now);
      }),
    forTurn: (turnId: string) =>
      run((tx) => tx.select().from(outputs).where(eq(outputs.turnId, turnId)).all()),
    /**
     * Requests the agents' turns opened that no inbox item answers yet, with the agent. An
     * answer or approval wake has the dedupe key answer:<id> or approval:<id>.
     */
    unansweredRequests: (organizationId: string, userAgentIds: string[]) =>
      run(async (tx) =>
        userAgentIds.length
          ? tx
              .select({ userAgentId: turns.userAgentId, requestId: outputs.targetId })
              .from(outputs)
              .innerJoin(turns, eq(turns.id, outputs.turnId))
              .where(
                and(
                  eq(outputs.targetKind, "request"),
                  eq(turns.organizationId, organizationId),
                  inArray(turns.userAgentId, userAgentIds),
                  notExists(
                    tx
                      .select({ id: inbox.id })
                      .from(inbox)
                      .where(
                        and(
                          eq(inbox.userAgentId, turns.userAgentId),
                          or(
                            eq(
                              inbox.dedupeKey,
                              sql`${wakeDedupePrefixes.answer} || ${outputs.targetId}`,
                            ),
                            eq(
                              inbox.dedupeKey,
                              sql`${wakeDedupePrefixes.approval} || ${outputs.targetId}`,
                            ),
                          ),
                        ),
                      ),
                  ),
                ),
              )
              .all()
          : [],
      ),
  };
}
