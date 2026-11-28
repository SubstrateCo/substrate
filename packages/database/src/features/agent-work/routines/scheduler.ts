import { userAgents } from "../../../core/actors/user-agents.schema";
import { commit, effectsFor } from "../../../core/effects";
import type { DatabaseExecutor } from "../../../core/executor";
import { admit } from "../admission/admission";
import { agentRoutines } from "../routines.schema";
import { dueOccurrence } from "./schedule";
import { and, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";

const routineFireLimit = 100;

export async function fireDueRoutines(
  db: DatabaseExecutor,
  now = new Date(),
  limit = routineFireLimit,
) {
  const due = await db
    .select({ routine: agentRoutines })
    .from(agentRoutines)
    .innerJoin(userAgents, eq(userAgents.id, agentRoutines.userAgentId))
    .where(
      and(
        eq(agentRoutines.enabled, true),
        isNotNull(agentRoutines.nextFireAt),
        lte(agentRoutines.nextFireAt, now),
        sql`${agentRoutines.approvedRevision} = ${agentRoutines.revision}`,
        eq(userAgents.enabled, true),
        isNull(userAgents.deletedAt),
      ),
    )
    .orderBy(agentRoutines.nextFireAt)
    .limit(limit)
    .for("update", { of: agentRoutines, skipLocked: true });
  let fired = 0;
  for (const { routine } of due) {
    const { occurrence, nextFireAt } = dueOccurrence(
      routine.cron,
      routine.timezone,
      routine.nextFireAt!,
      now,
    );
    const { items, hints } = await admit(
      db,
      [
        {
          type: "routine",
          agent: {
            organizationId: routine.organizationId,
            userAgentId: routine.userAgentId,
            agentActorEntityId: routine.agentActorEntityId,
            ownerUserId: routine.ownerUserId,
          },
          routine: {
            id: routine.id,
            revision: routine.revision,
            prompt: routine.prompt,
            destination: {
              conversationId: routine.destinationConversationId,
              threadId: routine.destinationThreadId,
            },
          },
          scheduledAt: occurrence.toISOString(),
        },
      ],
      now,
    );
    for (const hint of hints) effectsFor(db).hint(hint);
    await db
      .update(agentRoutines)
      .set({ lastFiredAt: occurrence, nextFireAt })
      .where(and(eq(agentRoutines.id, routine.id), eq(agentRoutines.revision, routine.revision)));
    fired += items.length;
  }
  return fired;
}

/**
 * Fires due routines for every owner. Trusted: the server's periodic worker runs it. Returns how
 * many routine items it queued, and the hints to publish after commit.
 */
export function fireRoutines(db: DatabaseExecutor, now = new Date()) {
  return commit(db, (tx) => fireDueRoutines(tx, now));
}
