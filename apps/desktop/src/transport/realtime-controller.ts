import { desktopOrigin } from "@startup-os/contracts/desktop/links";
import {
  realtimeConnectInput,
  realtimeEvent,
  type RealtimeUpdate,
} from "@startup-os/contracts/realtime";

import type { ClientRequest, IncomingMessage } from "node:http";
import WebSocket from "ws";

interface RealtimeSocket {
  // ws uses the default "nodebuffer" binary type, which delivers each message as one Buffer.
  on(event: "message", callback: (data: Buffer) => void): void;
  on(
    event: "unexpected-response",
    callback: (request: ClientRequest, response: IncomingMessage) => void,
  ): void;
  on(event: "close", callback: (code: number) => void): void;
  on(event: "error", callback: () => void): void;
  terminate(): void;
}

export function createRealtimeController({
  backend,
  getCookie,
  emit,
  createSocket = (url, headers) =>
    new WebSocket(url, { headers, maxPayload: 64 * 1024, handshakeTimeout: 10_000 }),
  random = Math.random,
  schedule = (callback, delay) => setTimeout(callback, delay),
}: {
  backend: string;
  getCookie: () => string;
  emit: (event: RealtimeUpdate) => void;
  createSocket?: (url: URL, headers: Record<string, string>) => RealtimeSocket;
  random?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
}) {
  let epoch = 0;
  let socket: RealtimeSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    epoch++;
    clearTimeout(retry);
    retry = undefined;
    const previous = socket;
    socket = undefined;
    previous?.terminate();
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
        if (generation !== epoch) return;
        emit({ type: "status", status: "connecting" });
        const url = new URL("/api/v1/realtime", backend);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        if (organizationId !== null) url.searchParams.set("organizationId", organizationId);
        let current: RealtimeSocket;
        let ended = false;
        function end(forbidden = false) {
          if (generation !== epoch || ended) return;
          ended = true;
          emit({ type: "status", status: forbidden ? "forbidden" : "disconnected" });
          if (!forbidden) {
            const delay =
              Math.min(30_000, 500 * 2 ** Math.min(attempts++, 6)) * (0.5 + random() * 0.5);
            retry = schedule(open, delay);
          }
        }
        try {
          current = createSocket(url, { Cookie: getCookie(), Origin: desktopOrigin });
          socket = current;
        } catch {
          end();
          return;
        }
        current.on("message", (data) => {
          if (generation !== epoch || ended) return;
          try {
            const result = realtimeEvent.safeParse(JSON.parse(data.toString("utf8")));
            if (!result.success) return;
            if (result.data.type === "change" && result.data.organizationId !== organizationId)
              return;
            emit(result.data);
            if (result.data.type === "ready") {
              attempts = 0;
              emit({ type: "status", status: "connected" });
            }
          } catch {
            /* Ignore malformed wire data. */
          }
        });
        current.on("unexpected-response", (_request, response) => {
          response.resume();
          end(response.statusCode === 401 || response.statusCode === 403);
          current.terminate();
        });
        current.on("close", (code) => end(code === 1008 || code === 4401 || code === 4403));
        current.on("error", () => {
          end();
          current.terminate();
        });
      }
      open();
    },
  };
}
