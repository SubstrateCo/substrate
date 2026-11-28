import type { HarnessKind } from "@substrate/contracts/harness-runtime";

import type { LocalTransaction, RunTransaction } from "../database.ts";
import { nativeSessions, type EpochRotationReason } from "../schema/index.ts";
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";

export type NativeSessionRow = typeof nativeSessions.$inferSelect;

const scoped = (organizationId: string, sessionId: string) =>
  and(eq(nativeSessions.organizationId, organizationId), eq(nativeSessions.sessionId, sessionId));

async function sessionOf(tx: LocalTransaction, organizationId: string, sessionId: string) {
  return tx.select().from(nativeSessions).where(scoped(organizationId, sessionId)).get();
}

async function requireSession(tx: LocalTransaction, organizationId: string, sessionId: string) {
  const row = await sessionOf(tx, organizationId, sessionId);
  if (!row) throw new Error("Session not found.");
  return row;
}

async function rotate(
  tx: LocalTransaction,
  row: NativeSessionRow,
  now: number,
  resetGeneration = row.resetGeneration,
) {
  await tx
    .update(nativeSessions)
    .set({
      epoch: row.epoch + 1,
      epochTurns: 0,
      nativeSessionId: null,
      prefix: null,
      policyVersion: null,
      workspace: null,
      rotation: null,
      resetGeneration,
      updatedAt: now,
    })
    .where(scoped(row.organizationId, row.sessionId));
  return row.epoch + 1;
}

export function nativeSessionRepository(run: RunTransaction) {
  return {
    get: (organizationId: string, sessionId: string) =>
      run((tx) => sessionOf(tx, organizationId, sessionId)),
    ensure: (
      organizationId: string,
      input: { sessionId: string; userAgentId: string; harness: HarnessKind },
      now: number,
    ) =>
      run(async (tx) => {
        await tx
          .insert(nativeSessions)
          .values({ organizationId, ...input, createdAt: now, updatedAt: now })
          .onConflictDoNothing();
        return requireSession(tx, organizationId, input.sessionId);
      }),
    withPrefix: (organizationId: string) =>
      run((tx) =>
        tx
          .select()
          .from(nativeSessions)
          .where(
            and(
              eq(nativeSessions.organizationId, organizationId),
              isNotNull(nativeSessions.prefix),
            ),
          )
          .all(),
      ),
    opened: (
      organizationId: string,
      sessionId: string,
      input: { nativeSessionId: string; prefix: string; policyVersion: number },
      now: number,
    ) =>
      run((tx) =>
        tx
          .update(nativeSessions)
          .set({ ...input, updatedAt: now })
          .where(scoped(organizationId, sessionId)),
      ),
    /**
     * Records the epoch's prefix. The first one also fixes the epoch's working folder; a later
     * one, such as after a policy change, keeps it.
     */
    setPrefix: (
      organizationId: string,
      sessionId: string,
      input: { prefix: string; policyVersion: number; workspace: string | null },
      now: number,
    ) =>
      run(async (tx) => {
        const row = await requireSession(tx, organizationId, sessionId);
        await tx
          .update(nativeSessions)
          .set({
            prefix: input.prefix,
            policyVersion: input.policyVersion,
            workspace: row.prefix === null ? input.workspace : row.workspace,
            updatedAt: now,
          })
          .where(scoped(organizationId, sessionId));
      }),
    countTurn: (organizationId: string, sessionId: string, now: number) =>
      run(async (tx) => {
        const row = await requireSession(tx, organizationId, sessionId);
        await tx
          .update(nativeSessions)
          .set({ epochTurns: row.epochTurns + 1, updatedAt: now })
          .where(scoped(organizationId, sessionId));
      }),
    /**
     * Asks for a new epoch. A session without a native session rotates at once. Otherwise the
     * caller submits the epoch's handoff item to the server; the rotation stays pending until
     * the handoff turn ends. Returns the epoch to hand off, or null when nothing is to submit.
     */
    requestRotation: (
      organizationId: string,
      sessionId: string,
      reason: EpochRotationReason,
      now: number,
    ) =>
      run(async (tx) => {
        const row = await requireSession(tx, organizationId, sessionId);
        if (row.rotation) return { action: "pending" as const };
        if (!row.nativeSessionId) {
          await rotate(tx, row, now);
          return { action: "rotated" as const };
        }
        await tx
          .update(nativeSessions)
          .set({ rotation: reason, updatedAt: now })
          .where(scoped(organizationId, sessionId));
        return { action: "submit" as const, fromEpoch: row.epoch };
      }),
    rotate: (organizationId: string, sessionId: string, now: number) =>
      run(async (tx) => rotate(tx, await requireSession(tx, organizationId, sessionId), now)),
    /**
     * Applies the server session's reset generation. A higher generation than the current
     * epoch started after begins a new epoch. Returns whether it did.
     */
    applyReset: (organizationId: string, sessionId: string, resetGeneration: number, now: number) =>
      run(async (tx) => {
        const row = await requireSession(tx, organizationId, sessionId);
        if (resetGeneration <= row.resetGeneration) return false;
        await rotate(tx, row, now, resetGeneration);
        return true;
      }),
    outdatedPolicy: (organizationId: string, policyVersion: number) =>
      run((tx) =>
        tx
          .select({ sessionId: nativeSessions.sessionId, userAgentId: nativeSessions.userAgentId })
          .from(nativeSessions)
          .where(
            and(
              eq(nativeSessions.organizationId, organizationId),
              isNotNull(nativeSessions.policyVersion),
              ne(nativeSessions.policyVersion, policyVersion),
              isNull(nativeSessions.rotation),
            ),
          )
          .all(),
      ),
  };
}
