import { outboxClaimLimit, type OutboxBatch } from "@substrate/database/trusted";

const outboxRelayMs = 5_000;

interface Dependencies {
  claim: () => Promise<OutboxBatch[]>;
  send: (message: string) => Promise<void>;
  finish: (id: string) => Promise<void>;
  reportFailure: (message: string) => void;
}

export function createOutboxRelay(
  dependencies: Dependencies,
  { claimLimit = outboxClaimLimit, maxRounds = 50 } = {},
) {
  let running: Promise<void> | undefined;
  async function flush() {
    for (let round = 0; round < maxRounds; round++) {
      const batches = await dependencies.claim();
      for (const batch of batches) {
        try {
          await dependencies.send(JSON.stringify(batch.changes));
        } catch {
          dependencies.reportFailure("Realtime relay could not publish; it will retry.");
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
