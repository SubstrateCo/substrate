import { realtimeKeys } from "@substrate/contracts/realtime";
import type {
  RealtimeAudience,
  RealtimeDomain,
  RealtimeEvent,
  RealtimeScope,
} from "@substrate/contracts/realtime";
import type { AudienceFilter, RealtimeReceiver } from "@substrate/database/realtime";

export interface Change {
  id: string;
  audience: Readonly<RealtimeAudience>;
  domain: RealtimeDomain;
  scope?: RealtimeScope;
}

export interface Transport {
  send(data: string): number;
  close(code: number, reason: string): void;
  terminate(): void;
  ping(): void;
  bufferedAmount(): number;
}

export interface HubDependencies {
  authenticate(headers: Headers, organizationId: string | null): Promise<RealtimeReceiver | null>;
  // Resolves an audience once per change. The filter checks only the audience; the hub
  // authenticates each identity separately.
  recipients(audience: Readonly<RealtimeAudience>): Promise<AudienceFilter>;
  reportFailure(): void;
}

interface Connection {
  identity: RealtimeReceiver;
  headers: Headers;
  transport?: Transport;
  expiresAt: number;
  awaitingPong: boolean;
  ready: boolean;
  // Start time of the last successful session check.
  verifiedAt: number;
  checking?: Promise<boolean>;
}

// Session and access hints can follow a revocation, so they recheck the session first.
const forcesRecheck = (change: Change) => change.domain === "session" || change.domain === "access";

async function forEachLimited<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await run(items[next++]!);
    }),
  );
}

// These keys select candidates only. The database resolver authorizes every delivery.
function relevant(identity: RealtimeReceiver, audience: Readonly<RealtimeAudience>) {
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
    // Revocations send session or access hints that force a check, so this is only a backstop.
    sessionCheckMs?: number;
    maxBufferedBytes?: number;
    maxConcurrentChecks?: number;
  } = {},
) {
  const connections = new Set<Connection>();
  const maxConnections = options.maxConnections ?? 1_000;
  const maxPerUser = options.maxPerUser ?? 8;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const sessionCheckMs = options.sessionCheckMs ?? 60_000;
  const maxBufferedBytes = options.maxBufferedBytes ?? 64 * 1024;
  const maxConcurrentChecks = options.maxConcurrentChecks ?? 16;
  let stopped = false;
  let available = true;
  const isAvailable = () => available;
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

  async function check(connection: Connection) {
    const startedAt = Date.now();
    const identity = await deps.authenticate(
      connection.headers,
      connection.identity.organizationId,
    );
    if (isStopped() || !connections.has(connection)) return false;
    const current = connection.identity;
    const unchanged =
      identity?.userId === current.userId &&
      identity.organizationId === current.organizationId &&
      identity.actorId === current.actorId;
    if (!unchanged) {
      remove(connection);
      return false;
    }
    connection.verifiedAt = Math.max(connection.verifiedAt, startedAt);
    return true;
  }

  // Concurrent checks share one session lookup. A forced check never reuses a lookup that may
  // have started before the revocation it follows.
  function revalidate(connection: Connection, forced = false) {
    if (!forced && connection.checking) return connection.checking;
    const pending = check(connection);
    connection.checking = pending;
    const clear = () => {
      if (connection.checking === pending) connection.checking = undefined;
    };
    void pending.then(clear, clear);
    return pending;
  }

  // The heartbeat rechecks every session when it is due, so a check stays valid until then.
  const fresh = (connection: Connection, now = Date.now()) =>
    now - connection.verifiedAt < sessionCheckMs;

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
      if (isStopped() || !isAvailable() || connections.size >= maxConnections)
        throw new Error("Realtime capacity reached");
      const verifiedAt = Date.now();
      const identity = await deps.authenticate(headers, organizationId);
      if (!identity || identity.organizationId !== organizationId) return null;
      if (isStopped() || !isAvailable() || connections.size >= maxConnections)
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
        verifiedAt,
      };
      connections.add(connection);
      return connection;
    },
    async open(connection: Connection, transport: Transport) {
      if (!connections.has(connection) || isStopped() || !available) {
        transport.close(1008, "Reconnect required");
        transport.terminate();
        return;
      }
      connection.transport = transport;
      try {
        // reserve() has just checked the session; recheck only after a slow upgrade.
        if (fresh(connection) || (await revalidate(connection))) {
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
    setAvailable(value: boolean) {
      available = value;
      if (!value) for (const connection of connections) remove(connection, 1012, "Resync required");
    },
    // Delivers one Valkey batch as a unit: each audience resolves once, and each connection checks
    // its session at most once.
    async publish(...changes: Change[]) {
      if (isStopped() || !available) return;
      const candidates: [Connection, Change[]][] = [];
      for (const connection of connections) {
        if (!connection.transport || !connection.ready) continue;
        const matching = changes.filter((change) => relevant(connection.identity, change.audience));
        if (matching.length) candidates.push([connection, matching]);
      }
      if (!candidates.length) return;
      const filters = new Map<string, Promise<AudienceFilter>>();
      for (const [, matching] of candidates)
        for (const { audience } of matching) {
          const key = JSON.stringify(audience);
          if (filters.has(key)) continue;
          const filter = deps.recipients(audience);
          // Each recipient awaits the filter and handles its failure.
          void filter.catch(() => {});
          filters.set(key, filter);
        }
      await forEachLimited(candidates, maxConcurrentChecks, async ([connection, matching]) => {
        try {
          // Filter first: a check either keeps the identity or removes the connection, so only
          // recipients need one.
          const received: Change[] = [];
          for (const change of matching) {
            const receives = await filters.get(JSON.stringify(change.audience))!;
            if (receives(connection.identity)) received.push(change);
          }
          if (!received.length) return;
          const forced = received.some(forcesRecheck);
          if ((forced || !fresh(connection)) && !(await revalidate(connection, forced))) return;
          for (const change of received) {
            if (isStopped() || !available || !connections.has(connection)) return;
            const event: Extract<RealtimeEvent, { type: "change" }> = {
              version: 1,
              type: "change",
              id: change.id,
              organizationId: connection.identity.organizationId,
              domain: change.domain,
            };
            if (change.audience[0] === "conversation") event.conversationId = change.audience[1];
            if (change.scope) event.scope = change.scope;
            send(connection, event);
          }
        } catch {
          remove(connection, 1012, "Resync required");
          deps.reportFailure();
        }
      });
    },
    async tick(now = Date.now()) {
      if (running || isStopped()) return;
      running = true;
      try {
        if (now >= nextHeartbeat) {
          nextHeartbeat = now + heartbeatMs;
          await forEachLimited([...connections], maxConcurrentChecks, async (connection) => {
            // A connection can close while it waits for its turn.
            if (!connections.has(connection)) return;
            if (!connection.transport || !connection.ready) {
              if (now >= connection.expiresAt) remove(connection);
              return;
            }
            if (connection.awaitingPong) {
              remove(connection, 1001, "Heartbeat timeout");
              return;
            }
            try {
              if (fresh(connection, now) || (await revalidate(connection))) {
                connection.awaitingPong = true;
                connection.transport.ping();
              }
            } catch {
              remove(connection, 1012, "Resync required");
              deps.reportFailure();
            }
          });
        }
      } catch {
        deps.reportFailure();
      } finally {
        running = false;
      }
    },
    start() {
      if (timer || isStopped()) return;
      timer = setInterval(() => void this.tick(), Math.min(heartbeatMs, 10_000));
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
