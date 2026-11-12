import { discardInactive, invalidate, refreshAll, tick } from "./client-cache.ts";
import { apiUrl, origin } from "./data.ts";
import { trace } from "./debug.ts";
import { hintTargets, type ChangeEvent, type HintTarget } from "./keys.ts";
import { wsDrops, wsHints, wsReady } from "./metrics.ts";
import { rng } from "./persona.ts";
import { clearInterval, clearTimeout, setInterval, setTimeout } from "k6/timers";
import { WebSocket, type EventName } from "k6/websockets";

/**
 * The web client's live connection (lib/realtime/browser.ts, components/realtime/
 * realtime-connection.tsx, queries/realtime/cache.ts): the socket only receives. Hints collect
 * for 50 ms, then invalidate their targets. Every `ready` refetches all mounted queries, and
 * while connected a 30 s reconcile does the same. Lost sockets reconnect with backoff.
 * The handshake uses the VU's cookie jar automatically; Origin is set explicitly.
 */

const batchMs = 50;
const reconcileMs = 30_000;
const readyTimeoutMs = 10_000;

interface Connection {
  socket?: WebSocket;
  connected: boolean;
  stopped: boolean;
  attempts: number;
  seen: Set<string>;
  pending: Map<string, HintTarget>;
  /** Clock tick of the latest hint in the batch. */
  since?: number;
  batch?: ReturnType<typeof setTimeout>;
  retry?: ReturnType<typeof setTimeout>;
  readyTimer?: ReturnType<typeof setTimeout>;
  reconcile?: ReturnType<typeof setInterval>;
}

let current: Connection | undefined;

const stopTimer = (id?: number) => id !== undefined && clearTimeout(id);

const background = (work: Promise<unknown>) =>
  void work.catch((error) => console.error(`[vu ${__VU}] background refresh: ${String(error)}`));

/**
 * Opens the socket for the active organization. `onChange` sees every new change hint, for
 * world state that a real user would notice (activity in a conversation).
 */
export function connectRealtime(
  organizationId: string,
  userId: string,
  onChange: (event: ChangeEvent) => void,
) {
  disconnectRealtime();
  const connection: Connection = {
    connected: false,
    stopped: false,
    attempts: 0,
    seen: new Set(),
    pending: new Map(),
  };
  current = connection;

  const flush = () => {
    connection.batch = undefined;
    const targets = [...connection.pending.values()];
    connection.pending.clear();
    background(invalidate(targets, "hint", connection.since));
  };

  const receive = (text: string) => {
    let event: { type?: string; organizationId?: string | null };
    try {
      event = JSON.parse(text);
    } catch {
      return;
    }
    if (event.type === "ready") {
      stopTimer(connection.readyTimer);
      connection.connected = true;
      connection.attempts = 0;
      wsReady.add(1);
      trace("ws", "ready");
      // The first ready loads the cache; later ones follow a reconnect and resync.
      discardInactive();
      background(refreshAll("ready"));
      return;
    }
    if (event.type !== "change" || event.organizationId !== organizationId) return;
    const change = event as ChangeEvent;
    if (connection.seen.has(change.id)) return;
    connection.seen.add(change.id);
    if (connection.seen.size > 1000) connection.seen.delete(connection.seen.values().next().value!);
    wsHints.add(1, { domain: change.domain });
    trace(
      "hint",
      `${change.domain}${change.scope ? `/${change.scope}` : ""} ${change.conversationId ?? ""}`,
    );
    onChange(change);
    const targets = hintTargets(change, userId);
    if (targets === null) {
      discardInactive();
      background(refreshAll("hint"));
      return;
    }
    for (const target of targets) connection.pending.set(JSON.stringify(target), target);
    connection.since = tick();
    connection.batch ??= setTimeout(flush, batchMs);
  };

  const open = () => {
    if (connection.stopped) return;
    const url = `${apiUrl.replace(/^http/, "ws")}/api/v1/realtime?organizationId=${encodeURIComponent(organizationId)}`;
    const socket = new WebSocket(url, null, { headers: { Origin: origin } });
    connection.socket = socket;
    let ended = false;
    const end = (code: number) => {
      if (ended) return;
      ended = true;
      stopTimer(connection.readyTimer);
      connection.connected = false;
      if (connection.stopped) return;
      wsDrops.add(1);
      trace("ws", `closed ${code}`);
      // Policy and auth closes mean no access; the client stops retrying.
      if (code === 1008 || code === 4401 || code === 4403) return;
      const delay =
        Math.min(30_000, 500 * 2 ** Math.min(connection.attempts++, 6)) * (0.5 + rng.next() * 0.5);
      connection.retry = setTimeout(open, delay);
    };
    connection.readyTimer = setTimeout(() => {
      end(0);
      socket.close();
    }, readyTimeoutMs);
    socket.onmessage = (event) => {
      if (!ended && typeof event?.data === "string") receive(event.data);
    };
    // The runtime passes the close event; the published types omit it.
    socket.addEventListener("close" as EventName, (event) =>
      end((event as { code?: number }).code ?? 1006),
    );
    socket.onerror = () => socket.close();
  };

  connection.reconcile = setInterval(() => {
    if (!connection.connected) return;
    discardInactive();
    background(refreshAll("reconcile"));
  }, reconcileMs);
  open();
}

/** Closes the socket and stops reconnects and the reconcile timer. */
export function disconnectRealtime() {
  const connection = current;
  if (!connection) return;
  current = undefined;
  connection.stopped = true;
  connection.connected = false;
  stopTimer(connection.batch);
  stopTimer(connection.retry);
  stopTimer(connection.readyTimer);
  if (connection.reconcile !== undefined) clearInterval(connection.reconcile);
  connection.socket?.close();
}
