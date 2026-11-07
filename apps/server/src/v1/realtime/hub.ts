import { realtimeKeys } from "@startup-os/contracts/realtime";
import type {
  RealtimeAudience,
  RealtimeDomain,
  RealtimeEvent,
} from "@startup-os/contracts/realtime";
import type { canReceiveChange } from "@startup-os/database/realtime";

export type Identity = Parameters<typeof canReceiveChange>[1];

export interface Change {
  id: string;
  audience: Readonly<RealtimeAudience>;
  domain: RealtimeDomain;
}

export interface Transport {
  send(data: string): number;
  close(code: number, reason: string): void;
  terminate(): void;
  ping(): void;
  bufferedAmount(): number;
}

export interface HubDependencies {
  authenticate(headers: Headers, organizationId: string | null): Promise<Identity | null>;
  canReceive(identity: Identity, audience: Readonly<RealtimeAudience>): Promise<boolean>;
  readChanges(): Promise<Change[]>;
  acknowledgeChanges(this: void, ids: string[]): Promise<void>;
  reportFailure(): void;
}

interface Connection {
  identity: Identity;
  headers: Headers;
  transport?: Transport;
  expiresAt: number;
  awaitingPong: boolean;
  ready: boolean;
}

// These keys select candidates only. The database resolver authorizes every delivery.
function relevant(identity: Identity, audience: Readonly<RealtimeAudience>) {
  switch (audience[0]) {
    case "user":
      return audience[1] === realtimeKeys.user(identity.userId)[1];
    case "organization":
      return (
        identity.organizationId !== null &&
        audience[1] === realtimeKeys.organization(identity.organizationId)[1]
      );
    case "actor":
      return (
        identity.organizationId !== null &&
        audience[1] === realtimeKeys.actor(identity.organizationId, audience[2])[1]
      );
    case "conversation":
      return identity.organizationId !== null;
  }
}

export function createRealtimeHub(
  deps: HubDependencies,
  options: {
    maxConnections?: number;
    maxPerUser?: number;
    heartbeatMs?: number;
    maxBufferedBytes?: number;
  } = {},
) {
  const connections = new Set<Connection>();
  const maxConnections = options.maxConnections ?? 1_000;
  const maxPerUser = options.maxPerUser ?? 8;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const maxBufferedBytes = options.maxBufferedBytes ?? 64 * 1024;
  let stopped = false;
  // Async authorization can yield while shutdown changes this flag.
  const isStopped = () => stopped;
  let running = false;
  let nextHeartbeat = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  function remove(connection: Connection, code = 1008, reason = "Reconnect required") {
    if (!connections.delete(connection)) return;
    connection.transport?.close(code, reason);
    // Do not retain a peer waiting indefinitely for the close handshake.
    connection.transport?.terminate();
  }

  async function revalidate(connection: Connection) {
    const identity = await deps.authenticate(
      connection.headers,
      connection.identity.organizationId,
    );
    if (isStopped() || !connections.has(connection)) return false;
    if (
      !identity ||
      identity.userId !== connection.identity.userId ||
      identity.organizationId !== connection.identity.organizationId
    ) {
      remove(connection);
      return false;
    }
    return true;
  }

  function send(connection: Connection, event: RealtimeEvent) {
    const transport = connection.transport;
    if (!transport) return;
    if (transport.bufferedAmount() > maxBufferedBytes) {
      remove(connection, 1013, "Resync required");
      throw new Error("Realtime backpressure budget exceeded");
    }
    let result: number;
    try {
      result = transport.send(JSON.stringify(event));
    } catch (error) {
      remove(connection, 1011, "Resync required");
      throw error;
    }
    if (result <= 0 || transport.bufferedAmount() > maxBufferedBytes) {
      remove(connection, 1013, "Resync required");
      throw new Error("Realtime send failed");
    }
  }

  return {
    async reserve(headers: Headers, organizationId: string | null) {
      if (isStopped() || connections.size >= maxConnections)
        throw new Error("Realtime capacity reached");
      const identity = await deps.authenticate(headers, organizationId);
      if (!identity || identity.organizationId !== organizationId) return null;
      if (isStopped() || connections.size >= maxConnections)
        throw new Error("Realtime capacity reached");
      let count = 0;
      for (const connection of connections)
        if (connection.identity.userId === identity.userId) count++;
      if (count >= maxPerUser) throw new Error("Realtime capacity reached");
      const connection: Connection = {
        identity,
        headers: new Headers(headers),
        expiresAt: Date.now() + 10_000,
        awaitingPong: false,
        ready: false,
      };
      connections.add(connection);
      return connection;
    },
    async open(connection: Connection, transport: Transport) {
      if (!connections.has(connection) || isStopped()) {
        transport.close(1008, "Reconnect required");
        transport.terminate();
        return;
      }
      connection.transport = transport;
      try {
        if (await revalidate(connection)) {
          send(connection, { version: 1, type: "ready" });
          connection.ready = connections.has(connection);
        }
      } catch {
        deps.reportFailure();
        remove(connection, 1011, "Service unavailable");
      }
    },
    close(connection: Connection) {
      connections.delete(connection);
    },
    unexpectedMessage(connection: Connection) {
      remove(connection, 1008, "Client messages are not supported");
    },
    pong(connection: Connection) {
      connection.awaitingPong = false;
    },
    async tick(now = Date.now()) {
      if (running || isStopped()) return;
      running = true;
      try {
        if (now >= nextHeartbeat) {
          nextHeartbeat = now + heartbeatMs;
          for (const connection of connections) {
            if (!connection.transport || !connection.ready) {
              if (now >= connection.expiresAt) remove(connection);
              continue;
            }
            if (connection.awaitingPong) {
              remove(connection, 1001, "Heartbeat timeout");
              continue;
            }
            if (await revalidate(connection)) {
              connection.awaitingPong = true;
              connection.transport.ping();
            }
          }
        }
        const changes = await deps.readChanges();
        const completed: string[] = [];
        try {
          for (let index = 0; index < changes.length;) {
            const change = changes[index]!;
            const ids = [change.id];
            index++;
            // Reset events are ordering boundaries, not ordinary invalidation hints.
            if (!["access", "session", "organization", "profile"].includes(change.domain)) {
              while (index < changes.length) {
                const next = changes[index]!;
                if (
                  next.domain !== change.domain ||
                  next.audience.length !== change.audience.length ||
                  !next.audience.every((part, position) => part === change.audience[position])
                )
                  break;
                ids.push(next.id);
                index++;
              }
            }
            // A retry can include new rows. Never reuse a previously seen row ID for a group.
            const eventId = ids.length === 1 ? change.id : crypto.randomUUID();
            if (isStopped()) return;
            for (const connection of connections) {
              if (
                !connection.transport ||
                !connection.ready ||
                !relevant(connection.identity, change.audience)
              )
                continue;
              if (!(await revalidate(connection))) continue;
              if (!(await deps.canReceive(connection.identity, change.audience))) continue;
              if (isStopped() || !connections.has(connection)) continue;
              const event: Extract<RealtimeEvent, { type: "change" }> = {
                version: 1,
                type: "change",
                id: eventId,
                organizationId: connection.identity.organizationId,
                domain: change.domain,
              };
              if (change.audience[0] === "conversation") event.conversationId = change.audience[1];
              send(connection, event);
            }
            completed.push(...ids);
          }
        } finally {
          if (!isStopped() && completed.length) await deps.acknowledgeChanges(completed);
        }
      } catch {
        // Keep the outbox row for retry. No event content or credentials in logs.
        deps.reportFailure();
      } finally {
        running = false;
      }
    },
    start() {
      if (timer || isStopped()) return;
      timer = setInterval(() => void this.tick(), 250);
      timer.unref();
    },
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = undefined;
      for (const connection of connections) remove(connection, 1001, "Server stopping");
    },
    get size() {
      return connections.size;
    },
  };
}

export type RealtimeHub = ReturnType<typeof createRealtimeHub>;
