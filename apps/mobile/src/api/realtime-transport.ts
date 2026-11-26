import {
  createRealtimeConnection,
  type RealtimeAPI,
  type RealtimeUpdate,
} from "@substrate/contracts/realtime";

import { z } from "zod";

export interface RealtimeSocket {
  onmessage: ((event: MessageEvent) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export function createAuthenticatedRealtime({
  baseURL,
  native,
  origin,
  getCookie,
  createSocket,
}: {
  baseURL: string;
  native: boolean;
  origin: string;
  getCookie: () => Promise<string>;
  createSocket: (url: string, headers?: Record<string, string>) => RealtimeSocket;
}): RealtimeAPI {
  const listeners = new Set<(event: RealtimeUpdate) => void>();
  let cookie = "";
  let generation = 0;
  const connection = createRealtimeConnection({
    origin: baseURL,
    handshakeTimeout: 10_000,
    emit(event) {
      for (const listener of listeners) listener(event);
    },
    open(url, { message, end }) {
      url.pathname = "/api/mobile/realtime";
      const socket = createSocket(
        url.toString(),
        native ? { Cookie: cookie, Origin: origin } : undefined,
      );
      socket.onmessage = ({ data }) => {
        const text = z
          .string()
          .max(64 * 1024)
          .safeParse(data);
        if (text.success) message(text.data);
      };
      socket.onclose = ({ code }) => end(code === 1008 || code === 4401 || code === 4403);
      socket.onerror = () => socket.close();
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
    async connect(input) {
      const current = ++generation;
      const storedCookie = native ? await getCookie() : "";
      if (current !== generation) return;
      cookie = storedCookie;
      connection.connect(input);
    },
    async disconnect() {
      generation++;
      cookie = "";
      connection.disconnect();
    },
  };
}
