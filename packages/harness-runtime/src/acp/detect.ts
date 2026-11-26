import type { HarnessKind } from "@substrate/contracts/harness-runtime";

import { HarnessError } from "../errors.ts";
import { binaryVersion, findCommands, isWindowsNative } from "../process.ts";
import { searchPath } from "../shell-path.ts";
import type { AcpLaunch } from "./api.ts";
import { acpManifest, type AcpManifestEntry } from "./manifest.ts";
import { followNpmShim } from "./npm-shim.ts";
import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { z } from "zod";

/** The process environment that detection reads. Tests replace it. */
export interface DetectEnvironment {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  arch: string;
  /** The PATH to search, repaired for GUI launches. Agents receive it as their PATH. */
  searchPath(): Promise<string>;
  /** Runs JavaScript adapter scripts: Electron with ELECTRON_RUN_AS_NODE, or Bun in tests. */
  execPath: string;
  /** The package.json path of a bundled adapter, or undefined when it is not shipped. */
  resolvePackage(name: string): string | undefined;
}

const require = createRequire(import.meta.url);

const defaultEnvironment = (): DetectEnvironment => ({
  env: process.env,
  platform: process.platform,
  arch: process.arch,
  searchPath,
  execPath: process.execPath,
  resolvePackage: (name) => {
    try {
      return require.resolve(`${name}/package.json`);
    } catch {
      return undefined;
    }
  },
});

export type AgentDetection =
  | { harness: HarnessKind; launch: AcpLaunch }
  | { harness: HarnessKind; launch?: undefined; reason: string };

const versionPattern = /(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?/;

/** The first x.y.z[-pre] version in text, such as `opencode 2.3.2` or `v2.3.2`. */
export function parseVersion(text: string): string | undefined {
  return versionPattern.exec(text)?.[0];
}

/** Negative when a < b, zero when equal, positive when a > b. A prerelease sorts below its release. */
export function compareVersions(a: string, b: string): number {
  const left = versionPattern.exec(a);
  const right = versionPattern.exec(b);
  if (!left || !right) throw new Error("Cannot compare versions without x.y.z.");
  for (let index = 1; index <= 3; index++) {
    const difference = Number(left[index]) - Number(right[index]);
    if (difference !== 0) return difference;
  }
  if (left[4] === right[4]) return 0;
  if (!left[4]) return 1;
  if (!right[4]) return -1;
  return left[4] < right[4] ? -1 : 1;
}

/** The package.json bin entries detection reads; a string bin is the package's only command. */
const packageManifestSchema = z
  .string()
  .transform((text, context) => {
    try {
      return JSON.parse(text);
    } catch {
      context.addIssue({ code: "custom", message: "package.json is not JSON." });
      return z.NEVER;
    }
  })
  .pipe(
    z.object({
      bin: z.union([
        z.string().transform(
          (path) =>
            (_name: string): string | undefined =>
              path,
        ),
        z.record(z.string(), z.string()).transform(
          (paths) =>
            (name: string): string | undefined =>
              paths[name],
        ),
      ]),
    }),
  );

/**
 * The first native executable for the CLI on PATH. On Windows an npm launcher shim is followed to
 * the native executable that its package installs; a shim without one is skipped.
 */
async function locateCli(
  name: string,
  path: string,
  environment: DetectEnvironment,
): Promise<{ command: string } | { reason: string }> {
  const { platform } = environment;
  let reason = `${name} is not on PATH.`;
  for (const match of await findCommands(name, path, {
    platform,
    pathext: environment.env.PATHEXT,
  })) {
    if (platform !== "win32" || isWindowsNative(match)) return { command: match };
    const command = await followNpmShim(name, match, environment.arch);
    if (command) return { command };
    reason = `${name} on PATH is the launcher script ${basename(match)}, and no native ${name}.exe was found in its package. Install the native ${name} CLI.`;
  }
  return { reason };
}

/** The user's CLI on PATH and its version, or the reason it is not usable. */
async function detectCli(
  entry: AcpManifestEntry,
  path: string,
  environment: DetectEnvironment,
): Promise<{ command: string; version: string } | { reason: string }> {
  const name = entry.locate.cli;
  const located = await locateCli(name, path, environment);
  if ("reason" in located) return located;
  const { command } = located;
  let version: string | undefined;
  try {
    version = parseVersion(await binaryVersion(command));
  } catch {
    return { reason: `${name} --version failed.` };
  }
  if (!version) return { reason: `${name} reported no version.` };
  if (entry.minVersion && compareVersions(version, entry.minVersion) < 0)
    return { reason: `${name} ${version} is older than ${entry.minVersion}.` };
  return { command, version };
}

/** The bundled adapter's bin script. A missing adapter is a packaging fault, not a user one. */
async function adapterScript(
  locate: AcpManifestEntry["locate"] & { kind: "adapter" },
  environment: DetectEnvironment,
): Promise<string | undefined> {
  const manifestPath = environment.resolvePackage(locate.package);
  if (!manifestPath) return undefined;
  const manifest = packageManifestSchema.safeParse(await readFile(manifestPath, "utf8"));
  const bin = manifest.data?.bin(locate.bin);
  if (!bin) return undefined;
  return realpath(resolve(dirname(manifestPath), bin)).catch(() => undefined);
}

/** Detects one allowlisted agent from the user's CLI. Never installs anything. */
export async function inspectAgent(
  harness: HarnessKind,
  environment: DetectEnvironment = defaultEnvironment(),
): Promise<AgentDetection> {
  const entry: AcpManifestEntry = acpManifest[harness];
  const path = await environment.searchPath();
  const cli = await detectCli(entry, path, environment);
  if ("reason" in cli) return { harness, reason: cli.reason };
  const { locate } = entry;
  if (locate.kind === "native")
    return {
      harness,
      launch: {
        harness,
        command: cli.command,
        args: [...locate.args],
        env: { PATH: path },
        version: cli.version,
      },
    };
  const script = await adapterScript(locate, environment);
  if (!script) return { harness, reason: `The bundled ${locate.package} adapter is missing.` };
  return {
    harness,
    launch: {
      harness,
      command: environment.execPath,
      args: [script],
      env: { PATH: path, ELECTRON_RUN_AS_NODE: "1", [locate.cliEnv]: cli.command },
      version: cli.version,
    },
  };
}

/** The launch of a detected, supported agent; undefined when it is missing or too old. */
export async function detectAgent(
  harness: HarnessKind,
  environment?: DetectEnvironment,
): Promise<AcpLaunch | undefined> {
  return (await inspectAgent(harness, environment)).launch;
}

/** The launch of a detected agent, or binary-not-found. */
export async function requireAgent(harness: HarnessKind): Promise<AcpLaunch> {
  const detection = await inspectAgent(harness);
  if (detection.launch) return detection.launch;
  throw new HarnessError(
    "binary-not-found",
    `The ${harness} agent was not detected: ${detection.reason} Install its CLI and sign in with it.`,
  );
}
