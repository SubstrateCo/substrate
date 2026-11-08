import type { RealtimeHint } from "@startup-os/contracts/realtime";

import { RedisClient } from "bun";

export const realtimeTopic = process.env.REALTIME_CHANNEL ?? "startup-os:realtime:v1";

export function createRefreshPublisher(
  send: (message: string) => Promise<void>,
  reportFailure: () => void,
) {
  // Call only after the outer transaction commits. Delivery cannot undo a write.
  return async (hints: RealtimeHint[] | Promise<RealtimeHint[]>) => {
    try {
      const changes = (await hints).map((hint) => ({
        ...hint,
        id: crypto.randomUUID(),
      }));
      if (changes.length) await send(JSON.stringify(changes));
    } catch {
      reportFailure();
    }
  };
}

let client: RedisClient | undefined;
export const publishRefresh = createRefreshPublisher(
  async (message) => {
    client ??= new RedisClient(process.env.VALKEY_URL ?? "redis://localhost:6379", {
      enableOfflineQueue: false,
      autoReconnect: false,
      connectionTimeout: 1_000,
    });
    if (!client.connected) await client.connect();
    await client.publish(realtimeTopic, message);
  },
  () => console.warn("Realtime publish failed; clients will resync"),
);

export function closeRefreshPublisher() {
  client?.close();
  client = undefined;
}
