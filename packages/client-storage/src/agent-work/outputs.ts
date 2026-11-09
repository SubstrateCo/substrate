import type { RunTransaction } from "../database.ts";
import { outputs, turns } from "../schema/index.ts";
import { and, eq, inArray } from "drizzle-orm";

export type OutputRow = typeof outputs.$inferSelect;

export type NewOutput =
  | { kind: "message"; id: string; conversationId: string; threadId: string | null }
  | { kind: "task"; id: string }
  | { kind: "request"; id: string; requestKind: "question" | "proposal" };

export function outputRepository(run: RunTransaction) {
  return {
    record: (turnId: string, output: NewOutput, now: number) =>
      run((tx) =>
        tx
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
          .onConflictDoNothing(),
      ),
    forTurn: (turnId: string) =>
      run((tx) => tx.select().from(outputs).where(eq(outputs.turnId, turnId)).all()),
    /** Requests the agent's turns opened, with the agent. */
    requests: (userAgentIds: string[]) =>
      run(async (tx) =>
        userAgentIds.length
          ? tx
              .select({ userAgentId: turns.userAgentId, requestId: outputs.targetId })
              .from(outputs)
              .innerJoin(turns, eq(turns.id, outputs.turnId))
              .where(
                and(eq(outputs.targetKind, "request"), inArray(turns.userAgentId, userAgentIds)),
              )
              .all()
          : [],
      ),
  };
}
