import {
  realtimeConnectionMachine,
  type RealtimeConnectionEvent,
  type RealtimeConnectionState,
} from "./connection-machine.ts";
import { realtimeConnectInput } from "./ipc.ts";
import { realtimeEvent, type RealtimeUpdate } from "./protocol.ts";

/** Callbacks a transport reports through. Calls from a replaced or ended socket are ignored. */
export interface RealtimeTransportHandlers {
  /** Report one decoded text frame. */
  message: (text: string) => void;
  /** Report that the socket ended. Forbidden endings do not retry. */
  end: (forbidden?: boolean) => void;
}

export interface RealtimeTransport {
  close(): void;
}

/**
 * Owns the realtime connection lifecycle independent of the socket implementation:
 * state transitions, connect epochs, stale-socket fencing, bounded retry with jitter,
 * and event validation.
 */
export function createRealtimeConnection({
  origin,
  emit,
  open: openTransport,
  handshakeTimeout,
  random = Math.random,
  schedule = (callback, delay) => setTimeout(callback, delay),
}: {
  origin: string;
  emit: (event: RealtimeUpdate) => void;
  /** Create the socket and attach handlers. Throwing counts as a lost connection. */
  open: (url: URL, handlers: RealtimeTransportHandlers) => RealtimeTransport;
  /** End and close a socket that has not become ready within this many milliseconds. */
  handshakeTimeout?: number;
  random?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
}) {
  let epoch = 0;
  let attempt = 0;
  let state: RealtimeConnectionState = "disconnected";
  let socket: RealtimeTransport | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function transition(event: RealtimeConnectionEvent) {
    const next = realtimeConnectionMachine.next(state, event);
    if (next === null) return false;
    state = next;
    return true;
  }
  function stop() {
    epoch++;
    transition("disconnect");
    clearTimeout(retry);
    clearTimeout(timeout);
    retry = undefined;
    const previous = socket;
    socket = undefined;
    previous?.close();
  }
  return {
    disconnect() {
      stop();
      emit({ type: "status", status: "disconnected" });
    },
    connect(value: { organizationId: string | null }) {
      const { organizationId } = realtimeConnectInput.strict().parse(value);
      stop();
      const generation = epoch;
      let attempts = 0;
      function open() {
        if (generation !== epoch || !transition("connect")) return;
        const currentAttempt = ++attempt;
        const live = () => generation === epoch && currentAttempt === attempt;
        emit({ type: "status", status: "connecting" });
        const url = new URL("/api/v1/realtime", origin);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        if (organizationId !== null) url.searchParams.set("organizationId", organizationId);
        function end(forbidden = false) {
          if (!live()) return;
          if (!transition(forbidden ? "forbidden" : "lost")) return;
          clearTimeout(timeout);
          emit({ type: "status", status: forbidden ? "forbidden" : "disconnected" });
          if (!forbidden) {
            const delay =
              Math.min(30_000, 500 * 2 ** Math.min(attempts++, 6)) * (0.5 + random() * 0.5);
            retry = schedule(open, delay);
          }
        }
        function message(text: string) {
          if (!live() || !realtimeConnectionMachine.canFire(state, "ready")) return;
          try {
            const result = realtimeEvent.safeParse(JSON.parse(text));
            if (!result.success) return;
            const event = result.data;
            if (event.type === "change" && event.organizationId !== organizationId) return;
            emit(event);
            if (event.type === "ready") {
              if (!transition("ready")) return;
              clearTimeout(timeout);
              attempts = 0;
              emit({ type: "status", status: "connected" });
            }
          } catch {
            /* Ignore malformed wire data. */
          }
        }
        let current: RealtimeTransport;
        try {
          current = openTransport(url, { message, end });
          socket = current;
        } catch {
          end();
          return;
        }
        if (handshakeTimeout !== undefined)
          timeout = setTimeout(() => {
            end();
            current.close();
          }, handshakeTimeout);
      }
      open();
    },
  };
}
