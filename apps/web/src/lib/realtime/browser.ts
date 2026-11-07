import {
  realtimeConnectInput,
  realtimeEvent,
  type RealtimeAPI,
  type RealtimeUpdate,
} from "@startup-os/contracts/realtime";

import { z } from "zod";

const wireText = z.string().max(64 * 1024);

export interface BrowserRealtimeSocket {
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export function createBrowserRealtime({
  origin = window.location.origin,
  createSocket = (url) => new WebSocket(url),
  random = Math.random,
  schedule = (callback, delay) => setTimeout(callback, delay),
}: {
  origin?: string;
  createSocket?: (url: URL) => BrowserRealtimeSocket;
  random?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
} = {}): RealtimeAPI {
  const listeners = new Set<(event: RealtimeUpdate) => void>();
  const emit = (event: RealtimeUpdate) => {
    for (const listener of listeners) listener(event);
  };
  let epoch = 0;
  let socket: BrowserRealtimeSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    epoch++;
    clearTimeout(retry);
    clearTimeout(timeout);
    const previous = socket;
    socket = undefined;
    previous?.close();
  }
  return {
    onEvent(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    async disconnect() {
      stop();
      emit({ type: "status", status: "disconnected" });
    },
    async connect(input) {
      const { organizationId } = realtimeConnectInput.strict().parse(input);
      stop();
      const generation = epoch;
      let attempts = 0;
      function open() {
        if (generation !== epoch) return;
        emit({ type: "status", status: "connecting" });
        const url = new URL("/api/v1/realtime", origin);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        if (organizationId !== null) url.searchParams.set("organizationId", organizationId);
        let ended = false;
        function end(forbidden = false) {
          if (generation !== epoch || ended) return;
          ended = true;
          clearTimeout(timeout);
          emit({ type: "status", status: forbidden ? "forbidden" : "disconnected" });
          if (!forbidden)
            retry = schedule(
              open,
              Math.min(30_000, 500 * 2 ** Math.min(attempts++, 6)) * (0.5 + random() * 0.5),
            );
        }
        let current: BrowserRealtimeSocket;
        try {
          current = createSocket(url);
          socket = current;
        } catch {
          end();
          return;
        }
        timeout = setTimeout(() => {
          end();
          current.close();
        }, 10_000);
        current.onmessage = ({ data }: MessageEvent) => {
          if (generation !== epoch || ended) return;
          const text = wireText.safeParse(data);
          if (!text.success) return;
          try {
            const result = realtimeEvent.safeParse(JSON.parse(text.data));
            if (!result.success) return;
            const event = result.data;
            if (event.type === "change" && event.organizationId !== organizationId) return;
            emit(event);
            if (event.type === "ready") {
              clearTimeout(timeout);
              attempts = 0;
              emit({ type: "status", status: "connected" });
            }
          } catch {
            /* Ignore malformed wire data. */
          }
        };
        current.onclose = ({ code }) => end(code === 1008 || code === 4401 || code === 4403);
        // Browsers report handshake failures as opaque network errors. Close owns retry policy.
        current.onerror = () => {
          current.close();
        };
      }
      open();
    },
  };
}
