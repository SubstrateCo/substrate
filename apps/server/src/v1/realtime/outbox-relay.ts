import { outboxClaimLimit, type OutboxBatch } from "@substrate/database/trusted";

/** How often the relay looks for batches that the server did not publish. */
const outboxRelayMs = 5_000;

interface Dependencies {
  /** Claims up to `claimLimit` due batches. */
  claim: () => Promise<OutboxBatch[]>;
  send: (message: string) => Promise<void>;
  finish: (id: string) => Promise<void>;
  reportFailure: (message: string) => void;
}

/**
 * Publishes hints that their write stored but the server did not publish, such as after a crash
 * or a Valkey outage. A failed batch stays claimed until its next attempt is due.
 */
export function createOutboxRelay(
  dependencies: Dependencies,
  { claimLimit = outboxClaimLimit, maxRounds = 50 } = {},
) {
  let running: Promise<void> | undefined;
  // Drains a backlog after an outage in one run, up to a bound so one run cannot go on forever.
  async function flush() {
    for (let round = 0; round < maxRounds; round++) {
      const batches = await dependencies.claim();
      for (const batch of batches) {
        try {
          await dependencies.send(JSON.stringify(batch.changes));
        } catch {
          dependencies.reportFailure("Realtime relay could not publish; it will retry.");
          // Valkey is likely down; later batches would fail too.
          return;
        }
        await dependencies.finish(batch.id);
      }
      if (batches.length < claimLimit) return;
    }
  }
  function trigger() {
    running ??= flush()
      .catch(() => dependencies.reportFailure("Realtime relay is unavailable; it will retry."))
      .finally(() => {
        running = undefined;
      });
    return running;
  }
  return {
    trigger,
    start(intervalMs = outboxRelayMs) {
      const timer = setInterval(() => void trigger(), intervalMs);
      timer.unref();
      return async () => {
        clearInterval(timer);
        await running;
      };
    },
  };
}
