import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { win32 } from "node:path";

export interface ShellPathProbe {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  userShell?: string;
  run(command: string, args: string[], timeoutMs: number): Promise<string | undefined>;
}

const captureStart = "__SUBSTRATE_PATH_START__";
const captureEnd = "__SUBSTRATE_PATH_END__";
const captureCommand = `printf '%s\\n' '${captureStart}'; printenv PATH || true; printf '%s\\n' '${captureEnd}'`;

function pathDelimiter(platform: NodeJS.Platform): string {
  return platform === "win32" ? ";" : ":";
}

/** The inherited PATH. Windows stores it as Path, and lookups there ignore case. */
function inheritedPath(env: Record<string, string | undefined>): string {
  return env.PATH ?? env.Path ?? env.path ?? "";
}

function normalizeEntry(entry: string, platform: NodeJS.Platform): string {
  const unquoted = entry.trim().replace(/^"+|"+$/g, "");
  if (platform !== "win32") return unquoted;
  return unquoted.replace(/[\\/]+$/, "").toLowerCase();
}

export function mergePaths(platform: NodeJS.Platform, ...values: (string | undefined)[]): string {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const value of values) {
    for (const entry of value?.split(pathDelimiter(platform)) ?? []) {
      const trimmed = entry.trim().replace(/^"+|"+$/g, "");
      const key = normalizeEntry(trimmed, platform);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(trimmed);
    }
  }
  return merged.join(pathDelimiter(platform));
}

/** The PATH printed between the capture markers; rc files may print other text around it. */
export function extractCapturedPath(output: string): string | undefined {
  const start = output.indexOf(captureStart);
  if (start === -1) return undefined;
  const end = output.indexOf(captureEnd, start + captureStart.length);
  if (end === -1) return undefined;
  return output.slice(start + captureStart.length, end).trim() || undefined;
}

function loginShellCandidates(probe: ShellPathProbe): string[] {
  const candidates = [probe.env.SHELL?.trim(), probe.userShell?.trim()];
  if (probe.platform === "darwin") candidates.push("/bin/zsh");
  if (probe.platform === "linux") candidates.push("/bin/bash");
  return [...new Set(candidates.filter((shell): shell is string => !!shell))];
}

async function loginShellPath(probe: ShellPathProbe): Promise<string | undefined> {
  for (const shell of loginShellCandidates(probe)) {
    const output = await probe.run(shell, ["-ilc", captureCommand], 5000);
    const path = output === undefined ? undefined : extractCapturedPath(output);
    if (path) return path;
  }
  if (probe.platform === "darwin")
    return (await probe.run("/bin/launchctl", ["getenv", "PATH"], 2000))?.trim() || undefined;
  return undefined;
}

export function expandWindowsVariables(
  value: string,
  env: Record<string, string | undefined>,
): string {
  const lookup = new Map(Object.entries(env).map(([key, entry]) => [key.toLowerCase(), entry]));
  return value.replace(
    /%([^%]+)%/g,
    (match, name: string) => lookup.get(name.toLowerCase()) ?? match,
  );
}

export function parseRegistryPath(output: string): string | undefined {
  return /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*?)\s*$/im.exec(output)?.[1] || undefined;
}

const registryPathKeys = [
  "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment",
  "HKCU\\Environment",
];

/** Machine then user PATH from the registry, the way Windows builds a new logon's PATH. */
async function registryPath(probe: ShellPathProbe): Promise<string[]> {
  const reg = win32.join(
    probe.env.SystemRoot ?? probe.env.WINDIR ?? "C:\\Windows",
    "System32",
    "reg.exe",
  );
  const values = await Promise.all(
    registryPathKeys.map(async (key) => {
      const output = await probe.run(reg, ["query", key, "/v", "Path"], 5000);
      const path = output === undefined ? undefined : parseRegistryPath(output);
      return path ? expandWindowsVariables(path, probe.env) : undefined;
    }),
  );
  return values.filter((value) => value !== undefined);
}

function knownWindowsCliDirectories(env: Record<string, string | undefined>): string[] {
  const appData = env.APPDATA?.trim();
  const localAppData = env.LOCALAPPDATA?.trim();
  const userProfile = env.USERPROFILE?.trim();
  return [
    ...(appData ? [win32.join(appData, "npm")] : []),
    ...(localAppData
      ? [
          win32.join(localAppData, "Programs", "nodejs"),
          win32.join(localAppData, "Volta", "bin"),
          win32.join(localAppData, "pnpm"),
        ]
      : []),
    ...(userProfile
      ? [
          win32.join(userProfile, ".bun", "bin"),
          win32.join(userProfile, ".local", "bin"),
          win32.join(userProfile, "scoop", "shims"),
        ]
      : []),
  ];
}

/**
 * The PATH that detection searches. A GUI-launched app inherits a short PATH: macOS and Linux
 * login shells add the user's CLI folders in front of it; on Windows the registry and known CLI
 * folders follow it.
 */
export async function computeSearchPath(probe: ShellPathProbe): Promise<string> {
  const inherited = inheritedPath(probe.env);
  if (probe.platform === "win32")
    return mergePaths(
      "win32",
      inherited,
      ...(await registryPath(probe)),
      knownWindowsCliDirectories(probe.env).join(";"),
    );
  return mergePaths(probe.platform, await loginShellPath(probe), inherited);
}

function run(command: string, args: string[], timeoutMs: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const child = execFile(
        command,
        args,
        {
          encoding: "utf8",
          timeout: timeoutMs,
          killSignal: "SIGKILL",
          maxBuffer: 1024 * 1024,
          shell: false,
          windowsHide: true,
        },
        (error, stdout) => resolve(error ? undefined : stdout),
      );
      child.stdin?.end();
    } catch {
      resolve(undefined);
    }
  });
}

function readUserShell(): string | undefined {
  try {
    return userInfo().shell ?? undefined;
  } catch {
    return undefined;
  }
}

let cached: Promise<string> | undefined;

export function searchPath(): Promise<string> {
  cached ??= computeSearchPath({
    platform: process.platform,
    env: process.env,
    userShell: readUserShell(),
    run,
  }).catch(() => inheritedPath(process.env));
  return cached;
}
