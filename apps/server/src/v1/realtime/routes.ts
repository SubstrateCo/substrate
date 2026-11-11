import { realtimeConnectInput } from "@substrate/contracts/realtime";

import type { RealtimeHub } from "./hub";
import { zValidator } from "@hono/zod-validator";
import type { ServerWebSocket } from "bun";
import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import { z } from "zod";

export function createRealtimeRoutes(hub: RealtimeHub, trustedOrigins: string[]) {
  // This factory is the official adapter for the pinned Hono version.
  // oxlint-disable-next-line typescript/no-deprecated
  const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket<unknown>>();
  type Connection = NonNullable<Awaited<ReturnType<RealtimeHub["reserve"]>>>;
  const peers = new WeakMap<object, Connection>();
  const app = new Hono<{ Variables: { connection: Connection } }>().get(
    "/api/v1/realtime",
    async (c, next) => {
      const origin = c.req.header("origin");
      if (!origin || !trustedOrigins.includes(origin)) return c.body(null, 403);
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
          const raw = ws.raw;
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
