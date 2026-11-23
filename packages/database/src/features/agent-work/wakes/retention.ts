import type { DatabaseExecutor } from "../../../core/executor";
import { agentWakes } from "./wakes.schema";
import { inArray, lt } from "drizzle-orm";

/**
 * The home desktop keeps its own copy of a wake once it acks it. Dedupe stays safe: message wakes
 * are created only in the send transaction, and answer wakes once, behind the request's
 * compare-and-set.
 */
export async function deleteAckedWakes(db: DatabaseExecutor, ackedBefore: Date, limit: number) {
  const deleted = await db
    .delete(agentWakes)
    .where(
      inArray(
        agentWakes.id,
        db
          .select({ id: agentWakes.id })
          .from(agentWakes)
          .where(lt(agentWakes.ackedAt, ackedBefore))
          .limit(limit),
      ),
    )
    .returning({ id: agentWakes.id });
  return deleted.length;
}
