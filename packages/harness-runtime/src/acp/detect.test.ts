import { compareVersions, inspectAgent, parseVersion, type DetectEnvironment } from "./detect.ts";
import { acpManifest } from "./manifest.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { copyFile, link, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "acp-detect-")));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A CLI on PATH that answers --version: the test runtime itself, which prints its own version. */
async function installCli(name: string) {
  const directory = join(root, "bin");
  await mkdir(directory, { recursive: true });
  const target = join(directory, process.platform === "win32" ? `${name}.exe` : name);
  await link(process.execPath, target).catch(() => copyFile(process.execPath, target));
  return { directory, command: await realpath(target) };
}

async function bundleAdapter(name: string, bin: string) {
  const directory = join(root, "node_modules", ...name.split("/"));
  await mkdir(join(directory, "dist"), { recursive: true });
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name, bin: { [bin]: "dist/index.js" } }),
  );
  await writeFile(join(directory, "dist", "index.js"), "");
  return { manifest: join(directory, "package.json"), script: join(directory, "dist", "index.js") };
}

const environment = (path: string, packages: Record<string, string> = {}): DetectEnvironment => ({
  env: { PATH: path },
  execPath: "/runtime/electron",
  resolvePackage: (name) => packages[name],
});

const runtimeVersion = parseVersion(Bun.version)!;

test("an adapter harness runs the bundled adapter and points it at the user's CLI", async () => {
  const { cli, package: name, bin, cliEnv } = acpManifest.claude.locate;
  const installed = await installCli(cli);
  const adapter = await bundleAdapter(name, bin);
  expect(
    await inspectAgent("claude", environment(installed.directory, { [name]: adapter.manifest })),
  ).toEqual({
    harness: "claude",
    launch: {
      harness: "claude",
      command: "/runtime/electron",
      args: [await realpath(adapter.script)],
      env: { ELECTRON_RUN_AS_NODE: "1", [cliEnv]: installed.command },
      version: runtimeVersion,
    },
  });
});

test("without the user's CLI, an adapter harness is not detected", async () => {
  const { package: name, bin } = acpManifest.codex.locate;
  const adapter = await bundleAdapter(name, bin);
  expect(
    await inspectAgent("codex", environment(join(root, "empty"), { [name]: adapter.manifest })),
  ).toEqual({ harness: "codex", reason: "codex is not on PATH." });
});

test("a CLI found without its bundled adapter reports a missing adapter", async () => {
  const installed = await installCli(acpManifest.codex.locate.cli);
  expect(await inspectAgent("codex", environment(installed.directory))).toEqual({
    harness: "codex",
    reason: `The bundled ${acpManifest.codex.locate.package} adapter is missing.`,
  });
});

test("a native ACP CLI older than the pinned minimum is not detected", async () => {
  const installed = await installCli(acpManifest.opencode.locate.cli);
  expect(await inspectAgent("opencode", environment(installed.directory))).toEqual({
    harness: "opencode",
    reason: `opencode ${runtimeVersion} is older than ${acpManifest.opencode.minVersion}.`,
  });
});

test("versions compare numerically and a prerelease sorts below its release", () => {
  expect(compareVersions("0.110.0", "0.109.0")).toBeGreaterThan(0);
  expect(compareVersions("2.3.2", "2.3.10")).toBeLessThan(0);
  expect(compareVersions("2.8.0-beta.1", "2.8.0")).toBeLessThan(0);
  expect(compareVersions("2.8.0", "2.8.0")).toBe(0);
  expect(parseVersion("opencode v2.3.2\n")).toBe("2.3.2");
});
