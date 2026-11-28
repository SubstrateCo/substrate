import { Glob, type ServerWebSocket } from "bun";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const webURL = new URL(process.env.SUBSTRATE_WEB_URL ?? "http://localhost:3100");
const apiURL = new URL(process.env.SUBSTRATE_API_URL ?? "http://localhost:3101");
const port = Number(webURL.port || (webURL.protocol === "https:" ? 443 : 80));
const outDir = resolve("node_modules/.e2e-dist");
const fingerprintPath = join(outDir, ".build-fingerprint");

async function computeBuildFingerprint() {
  const hash = createHash("sha256");
  const inputs: { cwd: string; pattern: string }[] = [
    { cwd: resolve("."), pattern: "{index.html,overlay.html,vite.config.ts,package.json}" },
    { cwd: resolve("src"), pattern: "**/*" },
    { cwd: resolve("../../packages/contracts/src"), pattern: "**/*" },
    { cwd: resolve("../.."), pattern: "{package.json,bun.lock}" },
  ];
  for (const { cwd, pattern } of inputs) {
    const entries: string[] = [];
    for await (const relative of new Glob(pattern).scan({ cwd, onlyFiles: true })) {
      entries.push(relative.replaceAll("\\", "/"));
    }
    entries.sort();
    for (const relative of entries) {
      const info = await stat(join(cwd, relative));
      hash.update(`${cwd}:${relative}:${info.size}:${info.mtimeMs}\n`);
    }
  }
  return hash.digest("hex");
}

async function ensureBuiltBundle() {
  const nextFingerprint = await computeBuildFingerprint();
  if (existsSync(join(outDir, "index.html")) && existsSync(fingerprintPath)) {
    const previous = (await readFile(fingerprintPath, "utf8")).trim();
    if (previous === nextFingerprint) return;
  }
  const { build } = await import("vite");
  await build({
    mode: "e2e",
    logLevel: "warn",
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      reportCompressedSize: false,
    },
  });
  await writeFile(fingerprintPath, nextFingerprint, "utf8");
}

await ensureBuiltBundle();

const indexHtml = await readFile(join(outDir, "index.html"));
const staticFiles = new Map<string, string>();
for await (const relative of new Glob("**/*").scan({ cwd: outDir, onlyFiles: true })) {
  const normalized = relative.replaceAll("\\", "/");
  if (normalized === ".build-fingerprint") continue;
  staticFiles.set(`/${normalized}`, join(outDir, relative));
}

interface ProxySocketData {
  url: string;
  headers: Record<string, string>;
  upstream: WebSocket | null;
  pending: (string | ArrayBuffer)[];
}

const proxyPrefixes = ["/api", "/desktop"] as const;

function isProxyPath(pathname: string) {
  return proxyPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

type HeaderWebSocketConstructor = new (
  url: string,
  options: { headers: Record<string, string> },
) => WebSocket;

function openUpstreamSocket(url: string, headers: Record<string, string>) {
  // SAFETY: This script runs only in Bun, whose WebSocket constructor supports request headers.
  const Constructor = WebSocket as typeof WebSocket & HeaderWebSocketConstructor;
  return new Constructor(url, { headers });
}

function closeClient(client: ServerWebSocket<ProxySocketData>, code?: number, reason?: string) {
  if (client.readyState !== 1) return;
  if (code !== undefined && (code === 1000 || (code >= 3000 && code <= 4999))) {
    client.close(code, reason);
  } else {
    client.close();
  }
}

const server = Bun.serve<ProxySocketData>({
  port,
  async fetch(request, serverInstance) {
    const url = new URL(request.url);
    if (isProxyPath(url.pathname)) {
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const wsTarget = new URL(url.pathname + url.search, apiURL);
        wsTarget.protocol = wsTarget.protocol === "https:" ? "wss:" : "ws:";
        const headers: Record<string, string> = {};
        const cookie = request.headers.get("cookie");
        const origin = request.headers.get("origin");
        if (cookie) headers.cookie = cookie;
        if (origin) headers.origin = origin;
        const upgraded = serverInstance.upgrade(request, {
          data: { url: wsTarget.toString(), headers, upstream: null, pending: [] },
        });
        if (upgraded) return undefined;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      const target = new URL(url.pathname + url.search, apiURL);
      const headers = new Headers(request.headers);
      headers.delete("host");
      try {
        const upstream = await fetch(target, {
          method: request.method,
          headers,
          body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
          redirect: "manual",
          signal: request.signal,
          // Pass a compressed body through as it is: the browser decodes it, as in production.
          decompress: false,
        });
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: upstream.headers,
        });
      } catch (error) {
        if (request.signal.aborted) return new Response(null, { status: 499 });
        throw error;
      }
    }

    const staticFile = staticFiles.get(url.pathname);
    if (staticFile) {
      const headers = url.pathname.startsWith("/assets/")
        ? { "cache-control": "public, max-age=31536000, immutable" }
        : { "cache-control": "no-cache" };
      return new Response(Bun.file(staticFile), { headers });
    }

    return new Response(indexHtml, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-cache",
      },
    });
  },
  websocket: {
    open(client) {
      const upstream = openUpstreamSocket(client.data.url, client.data.headers);
      upstream.binaryType = "arraybuffer";
      client.data.upstream = upstream;
      upstream.addEventListener("open", () => {
        for (const chunk of client.data.pending) upstream.send(chunk);
        client.data.pending.length = 0;
      });
      upstream.addEventListener("message", (event) => {
        if (client.readyState !== 1) return;
        if (event.data instanceof ArrayBuffer) {
          client.send(event.data);
        } else {
          client.send(String(event.data));
        }
      });
      upstream.addEventListener("close", (event) => {
        closeClient(client, event.code, event.reason);
      });
      upstream.addEventListener("error", () => {
        closeClient(client);
      });
    },
    message(client, message) {
      const upstream = client.data.upstream;
      if (!upstream) return;
      const payload = message instanceof Uint8Array ? new Uint8Array(message).buffer : message;
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(payload);
      } else if (upstream.readyState === WebSocket.CONNECTING) {
        client.data.pending.push(payload);
      }
    },
    close(client, code, reason) {
      const upstream = client.data.upstream;
      client.data.upstream = null;
      client.data.pending.length = 0;
      if (!upstream) return;
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        if (code === 1000 || (code >= 3000 && code <= 4999)) {
          upstream.close(code, reason);
        } else {
          upstream.close();
        }
      }
    },
  },
});

console.log(`Substrate E2E web server listening on ${server.url}`);

function shutdown() {
  void server.stop(true);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
