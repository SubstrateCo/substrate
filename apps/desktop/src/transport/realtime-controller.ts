import { desktopOrigin } from "@substrate/contracts/desktop/links";
import { createRealtimeConnection, type RealtimeUpdate } from "@substrate/contracts/realtime";

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
  random,
  schedule,
}: {
  backend: string;
  getCookie: () => string;
  emit: (event: RealtimeUpdate) => void;
  createSocket?: (url: URL, headers: Record<string, string>) => RealtimeSocket;
  random?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
}) {
  return createRealtimeConnection({
    origin: backend,
    emit,
    random,
    schedule,
    open(url, { message, end }) {
      const socket = createSocket(url, { Cookie: getCookie(), Origin: desktopOrigin });
      socket.on("message", (data) => message(data.toString("utf8")));
      socket.on("unexpected-response", (_request, response) => {
        response.resume();
        end(response.statusCode === 401 || response.statusCode === 403);
        socket.terminate();
      });
      socket.on("close", (code) => end(code === 1008 || code === 4401 || code === 4403));
      socket.on("error", () => {
        end();
        socket.terminate();
      });
      return { close: () => socket.terminate() };
    },
  });
}
