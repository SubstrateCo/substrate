import { _electron as electron, expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { bundledApplicationURL } from "../src/navigation.js";

test("isolated bundled renderer crops a blob and uploads directly to allowed HTTPS storage", async () => {
  const temporaryRoot = join(tmpdir(), "opencode");
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(join(temporaryRoot, "startup-os-storage-"));
  const key = join(directory, "key.pem");
  const cert = join(directory, "cert.pem");
  let uploaded = Buffer.alloc(0);
  const receivedCredentials: string[] = [];
  let disallowedRequests = 0;
  await promisify(execFile)("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
    "-subj",
    "/CN=localhost",
    "-addext",
    "subjectAltName=DNS:localhost,IP:127.0.0.1",
  ]);
  const server = createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    async (request, response) => {
      if (request.headers.cookie) receivedCredentials.push(request.headers.cookie);
      if (request.headers.authorization) receivedCredentials.push(request.headers.authorization);
      response.setHeader("Access-Control-Allow-Origin", bundledApplicationURL);
      response.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "content-type");
      if (request.method === "OPTIONS") return void response.end();
      if (request.method === "PUT") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        uploaded = Buffer.concat(chunks);
        response.end("stored");
      } else {
        response.setHeader("Content-Type", "image/png");
        response.end(uploaded);
      }
    },
  );
  const blocked = createServer(
    { key: await readFile(key), cert: await readFile(cert) },
    (_request, response) => {
      disallowedRequests++;
      response.end("unexpected");
    },
  );
  await Promise.all([
    new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)),
    new Promise<void>((resolve) => blocked.listen(0, "127.0.0.1", resolve)),
  ]);
  const address = server.address();
  const blockedAddress = blocked.address();
  if (
    !address ||
    // oxlint-disable-next-line deslop/no-runtime-typeof -- Node's server address boundary also supports Unix sockets; this fixture requires TCP ports.
    typeof address === "string" ||
    !blockedAddress ||
    // oxlint-disable-next-line deslop/no-runtime-typeof -- Reject Unix socket addresses before reading this fixture's TCP port.
    typeof blockedAddress === "string"
  )
    throw new Error("Missing fixture port.");
  const storage = `https://127.0.0.1:${address.port}`;
  const denied = `https://127.0.0.1:${blockedAddress.port}`;
  const rendererModule = new URL("../src/bundled-renderer.js", import.meta.url).href;
  const storageModule = new URL("../src/storage.js", import.meta.url).href;
  await writeFile(
    join(directory, "index.html"),
    '<!doctype html><title>Storage fixture</title><img id="preview"><img id="saved">',
  );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ type: "module", main: "main.js" }),
  );
  const main = join(directory, "main.js");
  await writeFile(
    main,
    `
    import { app, BrowserWindow, session, net } from 'electron';
    import { bundledRenderer } from ${JSON.stringify(rendererModule)};
    import { storageRequest } from ${JSON.stringify(storageModule)};
    app.whenReady().then(async () => {
    const isolated = session.fromPartition('storage-fixture');
    // Trust only this test's generated certificate, never change production TLS.
    isolated.setCertificateVerifyProc((request, callback) => callback(request.hostname === '127.0.0.1' ? 0 : -3));
    const external = storageRequest([${JSON.stringify(storage)}], (request, init) => isolated.fetch(request, { ...init, bypassCustomProtocolHandlers: true }));
    const serve = bundledRenderer({ directory: ${JSON.stringify(directory)}, backend: 'https://api.example.test',
      storageOrigins: [${JSON.stringify(storage)}], fetchFile: url => net.fetch(url),
      fetchUpstream: async () => new Response(null, { status: 302, headers: { location: ${JSON.stringify(`${storage}/image?signature=read`)} } }) });
    isolated.protocol.handle('https', request => new URL(request.url).origin === ${JSON.stringify(bundledApplicationURL)} ? serve(request) : external(request));
    await isolated.cookies.set({ url: ${JSON.stringify(storage)}, name: 'storage-secret', value: 'do-not-send', secure: true });
    const window = new BrowserWindow({ webPreferences: { partition: 'storage-fixture', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    await window.loadURL(${JSON.stringify(bundledApplicationURL)});
    });
  `,
  );
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== "ELECTRON_RUN_AS_NODE" && value !== undefined) env[key] = value;
  }
  const desktop = await electron.launch({ args: [main], env });
  try {
    const page = await desktop.firstWindow();
    await expect(page).toHaveTitle("Storage fixture");
    const result = await page.evaluate(
      async ({ storage, denied }) => {
        const source = document.createElement("canvas");
        source.width = 40;
        source.height = 20;
        const context = source.getContext("2d")!;
        context.fillStyle = "red";
        context.fillRect(0, 0, 20, 20);
        context.fillStyle = "blue";
        context.fillRect(20, 0, 20, 20);
        const blob = await new Promise<Blob>((resolve) =>
          source.toBlob((value) => resolve(value!), "image/png"),
        );
        const url = URL.createObjectURL(blob);
        const preview = document.querySelector<HTMLImageElement>("#preview")!;
        preview.src = url;
        await preview.decode();
        const crop = document.createElement("canvas");
        crop.width = crop.height = 20;
        crop.getContext("2d")!.drawImage(preview, 20, 0, 20, 20, 0, 0, 20, 20);
        const image = await new Promise<Blob>((resolve) =>
          crop.toBlob((value) => resolve(value!), "image/png"),
        );
        const response = await fetch(`${storage}/image?signature=write`, {
          method: "PUT",
          body: image,
          headers: { "Content-Type": "image/png" },
        });
        const saved = document.querySelector<HTMLImageElement>("#saved")!;
        saved.src = "/api/image";
        await saved.decode();
        // Also verify a fresh, CORS-enabled read of the stored pixels.
        const downloaded = await (await fetch(`${storage}/image?signature=read`)).blob();
        const bitmap = await createImageBitmap(downloaded);
        crop.getContext("2d")!.drawImage(bitmap, 0, 0);
        let rejected = false;
        try {
          await fetch(`${denied}/image`, { method: "PUT", body: image });
        } catch {
          rejected = true;
        }
        URL.revokeObjectURL(url);
        return {
          status: response.status,
          width: saved.naturalWidth,
          height: saved.naturalHeight,
          pixel: [...crop.getContext("2d")!.getImageData(0, 0, 1, 1).data],
          rejected,
        };
      },
      { storage, denied },
    );
    expect(result).toEqual({
      status: 200,
      width: 20,
      height: 20,
      pixel: [0, 0, 255, 255],
      rejected: true,
    });
    expect(uploaded.byteLength).toBeGreaterThan(0);
    expect(receivedCredentials).toEqual([]);
    expect(disallowedRequests).toBe(0);
  } finally {
    await desktop.close();
    await Promise.all([
      new Promise<void>((resolve) => server.close(() => resolve())),
      new Promise<void>((resolve) => blocked.close(() => resolve())),
    ]);
    await rm(directory, { recursive: true, force: true });
  }
});
