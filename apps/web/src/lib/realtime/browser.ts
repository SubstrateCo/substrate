import {
  createRealtimeConnection,
  type RealtimeAPI,
  type RealtimeUpdate,
} from "@substrate/contracts/realtime";

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
  random,
  schedule,
}: {
  origin?: string;
  createSocket?: (url: URL) => BrowserRealtimeSocket;
  random?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
} = {}): RealtimeAPI {
  const listeners = new Set<(event: RealtimeUpdate) => void>();
  const connection = createRealtimeConnection({
    origin,
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
    handshakeTimeout: 10_000,
    random,
    schedule,
    open(url, { message, end }) {
      const socket = createSocket(url);
      socket.onmessage = ({ data }: MessageEvent) => {
        const text = wireText.safeParse(data);
        if (text.success) message(text.data);
      };
      socket.onclose = ({ code }) => end(code === 1008 || code === 4401 || code === 4403);
      // Browsers report handshake failures as opaque network errors. Close owns retry policy.
      socket.onerror = () => {
        socket.close();
      };
      return socket;
    },
  });
  return {
    onEvent(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    async disconnect() {
      connection.disconnect();
    },
    async connect(input) {
      connection.connect(input);
    },
  };
}
