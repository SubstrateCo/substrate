import type { RunTransaction } from "../database.ts";
import { handoffs, sessions, type EpochRotationReason } from "../schema/index.ts";
import { insertItem } from "./inbox.ts";
import { rotateEpoch, sessionById } from "./sessions.ts";
import { and, eq } from "drizzle-orm";

export function epochRepository(run: RunTransaction) {
  return {
    /**
     * Asks for a new epoch. A session without a native session rotates at once. Otherwise one
     * handoff item waits in the system lane; the claim runs it alone after the live turn, and
     * finishing it starts the next epoch, so later items run in the new epoch.
     */
    requestRotation: (sessionId: string, reason: EpochRotationReason, body: string, now: number) =>
      run(async (tx) => {
        const session = await sessionById(tx, sessionId);
        if (!session) throw new Error("Session not found.");
        if (session.rotation) return "pending" as const;
        if (!session.nativeSessionId) {
          await rotateEpoch(tx, sessionId, now);
          return "rotated" as const;
        }
        await tx
          .update(sessions)
          .set({ rotation: reason, updatedAt: now })
          .where(eq(sessions.id, sessionId));
        await insertItem(
          tx,
          {
            sessionId,
            userAgentId: session.userAgentId,
            source: "epoch",
            sourceRef: { source: "epoch", fromEpoch: session.epoch },
            lane: "system",
            dedupeKey: `epoch:${sessionId}:${session.epoch}`,
            body,
          },
          now,
        );
        return "pending" as const;
      }),
    saveHandoff: (
      sessionId: string,
      epoch: number,
      input: { objectives: string; openWork: string; references: string[] },
      now: number,
    ) =>
      run((tx) =>
        tx
          .insert(handoffs)
          .values({ sessionId, epoch, ...input, createdAt: now })
          .onConflictDoUpdate({ target: [handoffs.sessionId, handoffs.epoch], set: input }),
      ),
    handoff: (sessionId: string, epoch: number) =>
      run((tx) =>
        tx
          .select()
          .from(handoffs)
          .where(and(eq(handoffs.sessionId, sessionId), eq(handoffs.epoch, epoch)))
          .get(),
      ),
  };
}
