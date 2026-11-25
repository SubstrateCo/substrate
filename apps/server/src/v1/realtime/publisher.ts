import type { RealtimeHint } from "@substrate/contracts/realtime";
import type { OutboxBatch, RealtimeChange } from "@substrate/database/trusted";

import { environment } from "../../environment";
import { RedisClient } from "bun";

/** Stores batches that could not be published, so the outbox relay publishes them later. */
export interface OutboxStore {
  record: (hints: RealtimeHint[]) => Promise<void>;
  finish: (id: string) => Promise<void>;
}

export function createRefreshPublisher(
  send: (message: string) => Promise<void>,
  reportFailure: () => void,
  outbox?: OutboxStore,
) {
  // Call only after the outer transaction commits. Delivery cannot undo a write.
  return async (
    hints: RealtimeHint[] | Promise<RealtimeHint[]>,
    // A write's hints, stored in its transaction. Publishing them deletes the row.
    stored?: OutboxBatch,
  ) => {
    let changes: RealtimeChange[];
    try {
      changes =
        stored?.changes ?? (await hints).map((hint) => ({ ...hint, id: crypto.randomUUID() }));
    } catch {
      reportFailure();
      return;
    }
    if (!changes.length) return;
    try {
      await send(JSON.stringify(changes));
    } catch {
      reportFailure();
      // A stored batch is already due for the relay. Store any other batch for it now. Clients
      // drop events they already received by ID, so a later publish of the same batch is safe.
      if (!stored) await outbox?.record(changes).catch(() => {});
      return;
    }
    if (stored) await outbox?.finish(stored.id).catch(() => {});
  };
}

export type RefreshPublisher = ReturnType<typeof createRefreshPublisher>;

export function createRedisPublisher(outbox?: OutboxStore) {
  let client: RedisClient | undefined;
  let closed = false;
  async function send(message: string) {
    if (closed) throw new Error("The realtime publisher is closed.");
    client ??= new RedisClient(environment.valkeyURL, {
      enableOfflineQueue: false,
      autoReconnect: false,
      connectionTimeout: 1_000,
    });
    if (!client.connected) await client.connect();
    await client.publish(environment.realtimeChannel, message);
  }
  const publish = createRefreshPublisher(
    send,
    () => console.warn("Realtime publish failed; the outbox relay will retry"),
    outbox,
  );

  function close() {
    closed = true;
    client?.close();
    client = undefined;
  }
  return { publish, send, close };
}
