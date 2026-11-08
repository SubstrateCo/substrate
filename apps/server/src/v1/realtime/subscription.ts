import { realtimeAudience, realtimeDomain, realtimeScope } from "@startup-os/contracts/realtime";

import type { Change } from "./hub";
import { realtimeTopic } from "./publisher";
import { RedisClient } from "bun";
import { z } from "zod";

const changes = z.array(
  z.object({
    id: z.uuid(),
    audience: realtimeAudience,
    domain: realtimeDomain,
    scope: realtimeScope.optional(),
  }),
);

export function createRealtimeSubscription({
  receive,
  setAvailable,
  url = process.env.VALKEY_URL ?? "redis://localhost:6379",
  topic = realtimeTopic,
}: {
  receive: (changes: Change[]) => Promise<void>;
  setAvailable: (available: boolean) => void;
  url?: string;
  topic?: string;
}) {
  let client: RedisClient | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const isStopped = () => stopped;

  async function connect() {
    if (stopped) return;
    const current = new RedisClient(url, {
      autoReconnect: false,
      enableOfflineQueue: false,
      connectionTimeout: 1_000,
    });
    client = current;
    function unavailable() {
      if (stopped || client !== current) return;
      setAvailable(false);
      current.onclose = null;
      current.close();
      clearTimeout(retry);
      retry = setTimeout(() => void connect(), 1_000);
      retry.unref();
    }
    current.onclose = unavailable;
    try {
      await current.connect();
      await current.subscribe(topic, (message) => {
        try {
          const batch = changes.parse(JSON.parse(message));
          void receive(batch).catch(unavailable);
        } catch {
          unavailable();
        }
      });
      if (!isStopped() && client === current) setAvailable(true);
    } catch {
      unavailable();
    }
  }

  return {
    start() {
      setAvailable(false);
      return connect();
    },
    stop() {
      stopped = true;
      clearTimeout(retry);
      setAvailable(false);
      client?.close();
    },
  };
}
