import type { DatabaseExecutor } from "./client";
import { expireInvocations } from "./features/agent-work/invocations";
import { deleteAckedWakes } from "./features/agent-work/retention";
import {
  deleteNotificationsOfDeletedEntities,
  deleteReadNotifications,
} from "./features/notifications/retention";

const day = 24 * 60 * 60_000;

/**
 * Deletes records nothing reads any more, in small batches so no statement holds many row locks.
 * Each rule stops after maxBatches; the next run continues.
 */
export async function pruneRecords(
  db: DatabaseExecutor,
  { batchSize = 500, maxBatches = 20 } = {},
) {
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * day);
  async function drain(run: (limit: number) => Promise<number>) {
    let total = 0;
    for (let batch = 0; batch < maxBatches; batch++) {
      const deleted = await run(batchSize);
      total += deleted;
      if (deleted < batchSize) break;
    }
    return total;
  }
  return {
    ackedWakes: await drain((limit) => deleteAckedWakes(db, ago(7), limit)),
    // Not a deletion: pending calls past their 24 hours move to expired, with an audit row.
    expiredInvocations: await drain((limit) => expireInvocations(db, limit)),
    readNotifications: await drain((limit) => deleteReadNotifications(db, ago(90), limit)),
    deletedTargetNotifications: await drain((limit) =>
      deleteNotificationsOfDeletedEntities(db, limit),
    ),
  };
}
