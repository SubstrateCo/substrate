import type { RunTransaction } from "../database.ts";
import { handoffs } from "../schema/index.ts";
import { and, eq } from "drizzle-orm";

export interface HandoffInput {
  objectives: string;
  openWork: string;
  references: string[];
}

/** What each epoch of a server session handed to the next one. */
export function handoffRepository(run: RunTransaction) {
  return {
    save: (
      organizationId: string,
      sessionId: string,
      epoch: number,
      input: HandoffInput,
      now: number,
    ) =>
      run((tx) =>
        tx
          .insert(handoffs)
          .values({ organizationId, sessionId, epoch, ...input, createdAt: now })
          .onConflictDoUpdate({
            target: [handoffs.organizationId, handoffs.sessionId, handoffs.epoch],
            set: input,
          }),
      ),
    get: (organizationId: string, sessionId: string, epoch: number) =>
      run((tx) =>
        tx
          .select()
          .from(handoffs)
          .where(
            and(
              eq(handoffs.organizationId, organizationId),
              eq(handoffs.sessionId, sessionId),
              eq(handoffs.epoch, epoch),
            ),
          )
          .get(),
      ),
  };
}
