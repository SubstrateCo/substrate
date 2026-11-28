import type { RealtimeHint } from "@substrate/contracts/realtime";
import type { OutboxBatch, RealtimeChange } from "@substrate/database/trusted";

import { environment } from "../../environment";
import { RedisClient } from "bun";

export interface OutboxStore {
  record: (hints: RealtimeHint[]) => Promise<void>;
  finish: (id: string) => Promise<void>;
}

export function createRefreshPublisher(
  send: (message: string) => Promise<void>,
  reportFailure: () => void,
  outbox?: OutboxStore,
) {
  return async (hints: RealtimeHint[] | Promise<RealtimeHint[]>, stored?: OutboxBatch) => {
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
      if (!stored) await outbox?.record(changes).catch(() => {});
      return;
    }
    if (stored) await outbox?.finish(stored.id).catch(() => {});
  };
}

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
