import type { HarnessKind } from "@startup-os/contracts/harness";

import { HarnessError } from "./errors.ts";
import { harnessDefinitions } from "./registry.ts";
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

export async function resolveExecutable(kind: HarnessKind): Promise<string> {
  const candidates = (process.env.PATH ?? "")
    .split(delimiter)
    .filter(Boolean)
    .flatMap((directory) =>
      (process.platform === "win32" ? [".exe", ".com", ""] : [""]).map((extension) =>
        join(directory, harnessDefinitions[kind].executable + extension),
      ),
    );
  for (const candidate of candidates) {
    try {
      await access(candidate);
      const resolved = await realpath(candidate);
      if (
        process.platform === "win32" &&
        ![".exe", ".com"].includes(extname(resolved).toLowerCase())
      )
        continue;
      return resolved;
    } catch {
      /* Not at this PATH entry; try the next one. */
    }
  }
  throw new HarnessError(
    "binary-not-found",
    `Install ${harnessDefinitions[kind].executable} and sign in with its native CLI. Windows requires a native executable, not a .cmd shim.`,
  );
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
    env: { ...process.env, ...env },
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

export async function antigravityAcpAvailable(executable: string): Promise<boolean> {
  const child = launch(executable, ["acp", "--help"], process.cwd());
  return new Promise((resolve) => {
    let output = "";
    const timer = setTimeout(() => {
      void stopProcess(child);
      resolve(false);
    }, 10_000);
    child.stdout.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(0, 64 * 1024);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(0, 64 * 1024);
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0 && output.includes("--process-per-session"));
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
