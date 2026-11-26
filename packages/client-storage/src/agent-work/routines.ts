import { sessionKeys } from "@substrate/contracts/agent-work";
import type { HarnessKind } from "@substrate/contracts/harness";
import { newId } from "@substrate/contracts/ids";

import type { RunTransaction } from "../database.ts";
import { inbox, routines, sessions } from "../schema/index.ts";
import { enqueue } from "./enqueue.ts";
import { localDedupeKeys, setItemStatus } from "./inbox.ts";
import { ensureSession } from "./sessions.ts";
import { and, desc, eq, isNotNull, lte } from "drizzle-orm";

export type RoutineRow = typeof routines.$inferSelect;

export interface RoutineFields {
  name: string;
  prompt: string;
  cron: string;
  timezone: string;
  destinationConversationId: string;
  destinationThreadId: string | null;
  enabled: boolean;
}

/** Changes to these fields create a new revision. Ticks of an older revision do not fire. */
const revisedFields = [
  "name",
  "prompt",
  "cron",
  "timezone",
  "destinationConversationId",
  "destinationThreadId",
] as const;

export function routineRepository(run: RunTransaction) {
  const get = (id: string) =>
    run((tx) => tx.select().from(routines).where(eq(routines.id, id)).get());
  return {
    get,
    create: (
      input: RoutineFields & { organizationId: string; userAgentId: string },
      nextFireAt: number | null,
      now: number,
    ) =>
      run(async (tx) => {
        const [row] = await tx
          .insert(routines)
          .values({ id: newId(), ...input, nextFireAt, createdAt: now })
          .returning();
        return row!;
      }),
    update: (id: string, changes: Partial<RoutineFields>, nextFireAt: number | null) =>
      run(async (tx) => {
        const routine = await tx.select().from(routines).where(eq(routines.id, id)).get();
        if (!routine) throw new Error("Routine not found.");
        const revised = revisedFields.some(
          (field) => changes[field] !== undefined && changes[field] !== routine[field],
        );
        const [row] = await tx
          .update(routines)
          .set({
            ...changes,
            revision: revised ? routine.revision + 1 : routine.revision,
            nextFireAt,
          })
          .where(eq(routines.id, id))
          .returning();
        return row!;
      }),
    delete: (id: string) =>
      run(async (tx) => {
        const session = await tx
          .select()
          .from(sessions)
          .where(eq(sessions.key, sessionKeys.routine(id)))
          .get();
        if (session) {
          const pending = await tx
            .select({ id: inbox.id })
            .from(inbox)
            .where(and(eq(inbox.sessionId, session.id), eq(inbox.status, "pending")))
            .all();
          await setItemStatus(
            tx,
            pending.map((item) => item.id),
            "drop",
            { reason: "routine_deleted" },
          );
        }
        await tx.delete(routines).where(eq(routines.id, id));
      }),
    list: (organizationId: string, userAgentId: string) =>
      run((tx) =>
        tx
          .select()
          .from(routines)
          .where(
            and(eq(routines.organizationId, organizationId), eq(routines.userAgentId, userAgentId)),
          )
          .orderBy(desc(routines.createdAt))
          .all(),
      ),
    /** Enabled routines whose next fire time passed. */
    due: (organizationId: string, now: number) =>
      run((tx) =>
        tx
          .select()
          .from(routines)
          .where(
            and(
              eq(routines.organizationId, organizationId),
              eq(routines.enabled, true),
              isNotNull(routines.nextFireAt),
              lte(routines.nextFireAt, now),
            ),
          )
          .all(),
      ),
    /**
     * Queues the routine's latest due occurrence. Older pending ticks of the routine are
     * superseded, so missed ticks collapse to one. The dedupe key makes a repeated fire for the
     * same occurrence a no-op. Fires only the revision that the caller computed from.
     */
    fire: (
      input: {
        routineId: string;
        revision: number;
        occurrence: number;
        nextFireAt: number | null;
        agentId: string;
        harness: HarnessKind;
      },
      now: number,
    ) =>
      run(async (tx) => {
        const routine = await tx
          .select()
          .from(routines)
          .where(eq(routines.id, input.routineId))
          .get();
        if (!routine?.enabled || routine.revision !== input.revision) return undefined;
        const destination = {
          conversationId: routine.destinationConversationId,
          threadId: routine.destinationThreadId,
        };
        const session = await ensureSession(
          tx,
          {
            organizationId: routine.organizationId,
            userAgentId: routine.userAgentId,
            agentId: input.agentId,
            key: sessionKeys.routine(routine.id),
            kind: "routine",
            harness: input.harness,
            destination,
          },
          now,
        );
        await tx
          .update(sessions)
          .set({
            destinationConversationId: destination.conversationId,
            destinationThreadId: destination.threadId,
          })
          .where(eq(sessions.id, session.id));
        const older = await tx
          .select({ id: inbox.id })
          .from(inbox)
          .where(
            and(
              eq(inbox.sessionId, session.id),
              eq(inbox.source, "routine"),
              eq(inbox.status, "pending"),
            ),
          )
          .all();
        const scheduledAt = new Date(input.occurrence).toISOString();
        const item = await enqueue(
          tx,
          {
            sessionId: session.id,
            userAgentId: routine.userAgentId,
            source: "routine",
            sourceRef: {
              source: "routine",
              routineId: routine.id,
              revision: routine.revision,
              scheduledAt,
            },
            dedupeKey: localDedupeKeys.routine(routine.id, routine.revision, scheduledAt),
            body: routine.prompt,
          },
          now,
        );
        if (item)
          await setItemStatus(
            tx,
            older.map((row) => row.id),
            "supersede",
          );
        await tx
          .update(routines)
          .set({ lastFiredAt: input.occurrence, nextFireAt: input.nextFireAt })
          .where(eq(routines.id, routine.id));
        return item;
      }),
  };
}
