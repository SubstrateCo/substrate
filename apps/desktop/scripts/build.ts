import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { backendURL } from "../src/bundled-renderer.js";

const desktop = fileURLToPath(new URL("../", import.meta.url));
const web = fileURLToPath(new URL("../../web/", import.meta.url));
// Only this validated, public origin is captured. Never serialize process.env.
const apiURL = backendURL(process.env.STARTUP_OS_API_URL, true);
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
await mkdir(`${desktop}/dist`, { recursive: true });
const { name, version, description, author } = JSON.parse(
  await readFile(`${desktop}/package.json`, "utf8"),
);
await Promise.all([
  cp(`${web}/dist`, `${desktop}/dist/renderer`, { recursive: true }),
  cp(`${desktop}/src/offline.html`, `${desktop}/dist/offline.html`),
  cp(`${desktop}/src/offline.css`, `${desktop}/dist/offline.css`),
  writeFile(`${desktop}/dist/desktop-config.json`, JSON.stringify({ apiURL })),
  writeFile(
    `${desktop}/dist/package.json`,
    JSON.stringify({ name, version, description, author, type: "module", main: "main.js" }),
  ),
]);
