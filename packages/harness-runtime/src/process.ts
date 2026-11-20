import { HarnessError } from "./errors.ts";
import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { EventEmitter } from "node:events";
import { access, realpath } from "node:fs/promises";
import { delimiter, extname, join } from "node:path";

// Node 24 and Bun expose the same process events, but their ambient ChildProcess
// declarations disagree when a consumer loads both sets of types.
export type NativeProcess = ChildProcessWithoutNullStreams &
  EventEmitter<{
    error: [Error];
    exit: [number | null, NodeJS.Signals | null];
    close: [number | null, NodeJS.Signals | null];
  }>;

/** Windows command extensions in lookup order: PATHEXT, then .PS1 for PowerShell-only shims. */
export function windowsCommandExtensions(pathext: string | undefined): string[] {
  const parsed = (pathext ?? "")
    .split(";")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .map((entry) => (entry.startsWith(".") ? entry : `.${entry}`));
  const extensions = parsed.length > 0 ? parsed : [".com", ".exe", ".bat", ".cmd"];
  return [...new Set([...extensions, ".ps1"])];
}

/** Native Windows programs that shell:false can start. */
export function isWindowsNative(file: string): boolean {
  return [".exe", ".com"].includes(extname(file).toLowerCase());
}

/**
 * Every file named `name` on PATH, in lookup order, with symlinks resolved. On Windows each
 * folder is tried with every command extension, and a file without one never counts. Launcher
 * scripts such as npm's .cmd shims are included: callers decide whether they can follow them.
 */
export async function findCommands(
  name: string,
  path: string,
  options: { platform?: NodeJS.Platform; pathext?: string } = {},
): Promise<string[]> {
  const windows = (options.platform ?? process.platform) === "win32";
  const extensions = windows ? windowsCommandExtensions(options.pathext) : [""];
  const found: string[] = [];
  for (const directory of path.split(windows ? ";" : delimiter)) {
    const folder = directory.trim().replace(/^"+|"+$/g, "");
    if (!folder) continue;
    for (const extension of extensions) {
      try {
        const candidate = join(folder, name + extension);
        await access(candidate);
        const resolved = await realpath(candidate);
        if (windows && !extensions.includes(extname(resolved).toLowerCase())) continue;
        if (!found.includes(resolved)) found.push(resolved);
      } catch {
        /* Not at this PATH entry; try the next one. */
      }
    }
  }
  return found;
}

/** base with overrides applied. Windows variable names ignore case, so one PATH replaces Path. */
export function overrideEnvironment(
  base: NodeJS.ProcessEnv,
  overrides: NodeJS.ProcessEnv | undefined,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  if (!overrides) return { ...base };
  const replaced =
    platform === "win32"
      ? new Set(Object.keys(overrides).map((key) => key.toLowerCase()))
      : new Set(Object.keys(overrides));
  const kept = Object.entries(base).filter(
    ([key]) => !replaced.has(platform === "win32" ? key.toLowerCase() : key),
  );
  return { ...Object.fromEntries(kept), ...overrides };
}

export function launch(
  executable: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): NativeProcess {
  // SAFETY: spawn with stdio:pipe returns all three streams, and native ChildProcess implements the listed EventEmitter methods.
  return spawn(executable, args, {
    cwd,
    env: overrideEnvironment(process.env, env),
    shell: false,
    windowsHide: true,
    stdio: "pipe",
  }) as NativeProcess;
}

export async function stopProcess(child: NativeProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32" || !child.pid) {
    child.kill();
    return;
  }
  // Native Windows launchers (including Scoop .exe shims) can own a second process.
  // Terminate only the subtree rooted at the process this host spawned.
  const taskkill = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
  const killer = launch(taskkill, ["/PID", String(child.pid), "/T", "/F"], process.cwd());
  killer.stdout.resume();
  killer.stderr.resume();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      killer.kill();
      child.kill();
      resolve();
    }, 5000);
    killer.once("error", () => {
      clearTimeout(timer);
      child.kill();
      resolve();
    });
    killer.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function binaryVersion(executable: string): Promise<string> {
  const child = launch(executable, ["--version"], process.cwd());
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new HarnessError("process-timeout", "Version inspection timed out."));
    }, 10_000);
    child.stdout.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(0, 4096);
    });
    child.stderr.resume();
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(new HarnessError("process-spawn", "Cannot launch native harness.", { cause: error }));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0)
        reject(new HarnessError("process-exit", `Native harness exited with code ${code}.`));
      else resolve(output.trim());
    });
  });
}
