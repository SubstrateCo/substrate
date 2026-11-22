import { realtimeConnectInput } from "@substrate/contracts/realtime";

import { isTrustedOrigin } from "../../shared/origin-check";
import type { RealtimeHub } from "./hub";
import { upgradeWebSocket, websocket, type BunWebSocketData } from "@hono/bun";
import { zValidator } from "@hono/zod-validator";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { z } from "zod";

export function createRealtimeRoutes(hub: RealtimeHub, trustedOrigins: string[]) {
  type Connection = NonNullable<Awaited<ReturnType<RealtimeHub["reserve"]>>>;
  const peers = new WeakMap<object, Connection>();
  const app = new Hono<{ Variables: { connection: Connection } }>().get(
    "/api/v1/realtime",
    async (c, next) => {
      const origin = c.req.header("origin");
      if (!isTrustedOrigin(origin, trustedOrigins)) return c.body(null, 403);
      if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return c.body(null, 426);
      await next();
    },
    zValidator(
      "query",
      z
        .object({
          organizationId: realtimeConnectInput.shape.organizationId.unwrap().optional(),
        })
        .strict(),
      (result, c) => {
        if (!result.success) return c.body(null, 400);
      },
    ),
    async (c, next) => {
      let connection: Connection | null = null;
      try {
        connection = await hub.reserve(
          c.req.raw.headers,
          c.req.valid("query").organizationId ?? null,
        );
        if (!connection) return c.body(null, 403);
        c.set("connection", connection);
        await next();
      } catch {
        if (connection) hub.close(connection);
        return c.body(null, 503);
      }
    },
    upgradeWebSocket((c) => {
      const connection = c.get("connection");
      return {
        onOpen(_event, ws) {
          // The adapter types its socket as any; under Bun it is Bun's server socket.
          const raw: ServerWebSocket<BunWebSocketData> | undefined = ws.raw;
          if (!raw) {
            hub.close(connection);
            return;
          }
          peers.set(raw, connection);
          void hub.open(connection, {
            send: (data) => raw.send(data),
            close: (code, reason) => raw.close(code, reason),
            terminate: () => raw.terminate(),
            ping: () => {
              raw.ping();
            },
            bufferedAmount: () => raw.getBufferedAmount(),
          });
        },
        onMessage() {
          hub.unexpectedMessage(connection);
        },
        onClose() {
          hub.close(connection);
        },
        onError() {
          hub.close(connection);
        },
      };
    }),
  );
  return {
    app,
    websocket: {
      ...websocket,
      maxPayloadLength: 1024,
      backpressureLimit: 64 * 1024,
      closeOnBackpressureLimit: true,
      idleTimeout: 45,
      pong(ws: Parameters<typeof websocket.open>[0]) {
        const connection = peers.get(ws);
        if (connection) hub.pong(connection);
      },
    },
  };
}
