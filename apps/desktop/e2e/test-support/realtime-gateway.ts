import { desktopOrigin } from "@startup-os/contracts/desktop/links";

import { createServer, request } from "node:http";
import type { Duplex } from "node:stream";

// Test-owned fault boundary. HTTP keeps working while socket upgrades are held off.
export async function createRealtimeGateway(backend: string, port: number) {
  const sockets = new Set<Duplex>();
  const nativePeers = new Set<Duplex>();
  let blocked = false;
  let denied = 0;
  const server = createServer((incoming, response) => {
    const upstream = request(
      new URL(incoming.url ?? "/", backend),
      {
        method: incoming.method,
        headers: incoming.headers,
      },
      (result) => {
        response.writeHead(result.statusCode ?? 502, result.headers);
        result.pipe(response);
      },
    );
    upstream.on("error", () => {
      if (!response.headersSent) response.writeHead(502);
      response.end();
    });
    incoming.pipe(upstream);
  });
  server.on("upgrade", (incoming, socket, head) => {
    if (blocked) {
      denied++;
      socket.end(
        "HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n",
      );
      return;
    }
    const upstream = request(new URL(incoming.url ?? "/", backend), {
      headers: incoming.headers,
    });
    upstream.on("upgrade", (result, peer, peerHead) => {
      sockets.add(socket);
      sockets.add(peer);
      if (incoming.headers.origin === desktopOrigin) nativePeers.add(socket);
      socket.once("close", () => {
        sockets.delete(socket);
        nativePeers.delete(socket);
        peer.destroy();
      });
      peer.once("close", () => {
        sockets.delete(peer);
        socket.destroy();
      });
      socket.on("error", () => peer.destroy());
      peer.on("error", () => socket.destroy());
      const headers: string[] = [];
      for (let index = 0; index < result.rawHeaders.length; index += 2)
        headers.push(`${result.rawHeaders[index]}: ${result.rawHeaders[index + 1]}`);
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers.join("\r\n")}\r\n\r\n`);
      if (head.length) peer.write(head);
      if (peerHead.length) socket.write(peerHead);
      socket.pipe(peer);
      peer.pipe(socket);
    });
    upstream.on("response", (result) => {
      result.resume();
      socket.end(
        `HTTP/1.1 ${result.statusCode ?? 502} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    upstream.end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "localhost", resolve);
  });
  return {
    origin: `http://localhost:${port}`,
    blockUpgrades() {
      blocked = true;
    },
    blockSockets() {
      blocked = true;
      for (const socket of sockets) socket.destroy();
    },
    allowSockets() {
      blocked = false;
    },
    get deniedUpgrades() {
      return denied;
    },
    get nativeConnections() {
      return nativePeers.size;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
