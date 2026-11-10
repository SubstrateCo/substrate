import { backendURL } from "../src/transport/bundled-renderer.js";
import { storageOrigins } from "../src/transport/storage.js";
import { bundleHarnessWorker, stageHarnessProductionAssets } from "./harness-worker.ts";
import { bundlePreload } from "./preload.js";
import { cp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const desktop = fileURLToPath(new URL("../", import.meta.url));
const web = fileURLToPath(new URL("../../web/", import.meta.url));
// Only this validated, public origin is captured. Never serialize process.env.
const apiURL = backendURL(process.env.STARTUP_OS_API_URL, true);
const webURL = backendURL(process.env.STARTUP_OS_WEB_URL, true);
// Signed uploads go to the storage endpoint the server signs with.
const storageEndpoint = process.env.S3_ENDPOINT;
const allowedStorageOrigins = storageOrigins(
  storageEndpoint ? new URL(storageEndpoint).origin : undefined,
  true,
);
// This is a generated staging directory, never a source directory.
await rm(`${desktop}/dist`, { recursive: true, force: true });
const renderer = Bun.spawn([process.execPath, "run", "build"], {
  cwd: web,
  stdout: "inherit",
  stderr: "inherit",
});
if ((await renderer.exited) !== 0) throw new Error("Renderer build failed.");
const result = await Bun.build({
  entrypoints: [fileURLToPath(new URL("../src/main.js", import.meta.url))],
  outdir: `${desktop}/dist`,
  target: "node",
  format: "esm",
  external: ["electron"],
});
if (!result.success) throw new AggregateError(result.logs, "Desktop main build failed.");
await bundlePreload(`${desktop}/dist`);
await bundleHarnessWorker(`${desktop}/dist`);
const harnessDependencies = await stageHarnessProductionAssets(`${desktop}/dist`);
const { name, version, description, author } = JSON.parse(
  await readFile(`${desktop}/package.json`, "utf8"),
);
await Promise.all([
  cp(`${web}/dist`, `${desktop}/dist/renderer`, { recursive: true }),
  cp(`${desktop}/src/shell/offline.html`, `${desktop}/dist/offline.html`),
  cp(`${desktop}/src/shell/offline.css`, `${desktop}/dist/offline.css`),
  writeFile(
    `${desktop}/dist/desktop-config.json`,
    JSON.stringify({ apiURL, webURL, storageOrigins: allowedStorageOrigins }),
  ),
  writeFile(
    `${desktop}/dist/package.json`,
    JSON.stringify({
      name,
      version,
      description,
      author,
      type: "module",
      main: "main.js",
      dependencies: harnessDependencies,
    }),
  ),
]);
