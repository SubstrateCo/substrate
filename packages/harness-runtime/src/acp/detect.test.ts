import { compareVersions, inspectAgent, parseVersion, type DetectEnvironment } from "./detect.ts";
import { acpManifest } from "./manifest.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { copyFile, link, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

let root: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "acp-detect-")));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

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
  env: {},
  platform: process.platform,
  arch: "x64",
  searchPath: async () => path,
  execPath: "/runtime/electron",
  resolvePackage: (name) => packages[name],
});

async function installNpmShim(name: string, nativeSegments?: string[]) {
  const directory = join(root, "npm");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `${name}.cmd`), "@ECHO off\r\nnode %~dp0\\cli.js %*\r\n");
  if (!nativeSegments) return { directory, command: undefined };
  const target = join(directory, ...nativeSegments);
  await mkdir(dirname(target), { recursive: true });
  await link(process.execPath, target).catch(() => copyFile(process.execPath, target));
  return { directory, command: target };
}

const windowsOnly = test.skipIf(process.platform !== "win32");

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
      env: { PATH: installed.directory, ELECTRON_RUN_AS_NODE: "1", [cliEnv]: installed.command },
      version: runtimeVersion,
    },
  });
});

windowsOnly("an npm claude.cmd shim is followed to the package's native claude.exe", async () => {
  const { package: name, bin, cliEnv } = acpManifest.claude.locate;
  const shim = await installNpmShim("claude", [
    "node_modules",
    "@anthropic-ai",
    "claude-code",
    "bin",
    "claude.exe",
  ]);
  const adapter = await bundleAdapter(name, bin);
  const detection = await inspectAgent(
    "claude",
    environment(shim.directory, { [name]: adapter.manifest }),
  );
  expect(detection.launch?.env?.[cliEnv]).toBe(shim.command!);
});

windowsOnly(
  "an npm codex.cmd shim is followed to the native codex.exe in its platform package",
  async () => {
    const { package: name, bin, cliEnv } = acpManifest.codex.locate;
    const shim = await installNpmShim("codex", [
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      "@openai",
      "codex-win32-x64",
      "vendor",
      "x86_64-pc-windows-msvc",
      "bin",
      "codex.exe",
    ]);
    const adapter = await bundleAdapter(name, bin);
    const detection = await inspectAgent(
      "codex",
      environment(shim.directory, { [name]: adapter.manifest }),
    );
    expect(detection.launch?.env?.[cliEnv]).toBe(shim.command!);
  },
);

windowsOnly("a shim without a native executable in its package is not detected", async () => {
  const shim = await installNpmShim("codex");
  expect(await inspectAgent("codex", environment(shim.directory))).toEqual({
    harness: "codex",
    reason:
      "codex on PATH is the launcher script codex.cmd, and no native codex.exe was found in its package. Install the native codex CLI.",
  });
});

windowsOnly("a native executable later on PATH wins over an unfollowable shim", async () => {
  const shim = await installNpmShim("opencode");
  const installed = await installCli("opencode");
  expect(
    await inspectAgent("opencode", environment(`${shim.directory};${installed.directory}`)),
  ).toEqual({
    harness: "opencode",
    reason: `opencode ${runtimeVersion} is older than ${acpManifest.opencode.minVersion}.`,
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
