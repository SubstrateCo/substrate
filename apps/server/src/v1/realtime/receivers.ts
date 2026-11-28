import type { RealtimeReceiver, ReceiverIdentity } from "@substrate/database/realtime";

interface Lookup {
  identity: ReceiverIdentity;
  resolve(receiver: RealtimeReceiver | null): void;
  reject(error: Error): void;
}

export function coalesceReceivers(
  resolveMany: (identities: ReceiverIdentity[]) => Promise<(RealtimeReceiver | null)[]>,
  maxBatch = 100,
) {
  let pending: Lookup[] | undefined;

  async function flush(batch: Lookup[]) {
    try {
      const results = await resolveMany(batch.map((lookup) => lookup.identity));
      if (results.length !== batch.length) throw new Error("Receiver batch result mismatch");
      batch.forEach((lookup, index) => lookup.resolve(results[index] ?? null));
    } catch (cause) {
      const error = new Error("Receiver batch failed", { cause });
      for (const lookup of batch) lookup.reject(error);
    }
  }

  return (identity: ReceiverIdentity) =>
    new Promise<RealtimeReceiver | null>((resolve, reject) => {
      if (!pending) {
        const batch: Lookup[] = [];
        pending = batch;
        setTimeout(() => {
          if (pending !== batch) return;
          pending = undefined;
          void flush(batch);
        }, 0);
      }
      pending.push({
        identity: { userId: identity.userId, organizationId: identity.organizationId },
        resolve,
        reject,
      });
      if (pending.length >= maxBatch) {
        const batch = pending;
        pending = undefined;
        void flush(batch);
      }
    });
}
