import {
  computeSearchPath,
  expandWindowsVariables,
  extractCapturedPath,
  mergePaths,
  parseRegistryPath,
  type ShellPathProbe,
} from "./shell-path.ts";
import { expect, test } from "bun:test";

type Call = { command: string; args: string[]; timeoutMs: number };

/** A probe whose programs answer from a table keyed by command; anything else fails. */
function probe(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  answers: Record<string, (args: string[]) => string | undefined>,
  userShell?: string,
) {
  const calls: Call[] = [];
  const value: ShellPathProbe = {
    platform,
    env,
    userShell,
    run: async (command, args, timeoutMs) => {
      calls.push({ command, args, timeoutMs });
      return answers[command]?.(args);
    },
  };
  return { probe: value, calls };
}

const captured = (path: string) =>
  `motd from .zshrc\n__SUBSTRATE_PATH_START__\n${path}\n__SUBSTRATE_PATH_END__\n`;

test("PATH merging keeps the first copy of each entry and drops empty entries", () => {
  expect(mergePaths("darwin", "/opt/homebrew/bin:/usr/bin", "/usr/bin::/bin")).toBe(
    "/opt/homebrew/bin:/usr/bin:/bin",
  );
  expect(mergePaths("win32", 'C:\\Tools;"C:\\Node\\"', "c:\\tools\\;C:\\node;C:\\Other")).toBe(
    "C:\\Tools;C:\\Node\\;C:\\Other",
  );
});

test("the captured PATH is read between the markers, ignoring rc output", () => {
  expect(extractCapturedPath(captured("/opt/homebrew/bin:/usr/bin"))).toBe(
    "/opt/homebrew/bin:/usr/bin",
  );
  expect(extractCapturedPath("__SUBSTRATE_PATH_START__\n/usr/bin")).toBeUndefined();
});

test("macOS puts the login-shell PATH in front of the inherited PATH", async () => {
  const { probe: value, calls } = probe(
    "darwin",
    { SHELL: "/usr/local/bin/fish", PATH: "/usr/bin:/bin" },
    { "/usr/local/bin/fish": () => captured("/opt/homebrew/bin:/usr/bin") },
  );
  expect(await computeSearchPath(value)).toBe("/opt/homebrew/bin:/usr/bin:/bin");
  expect(calls).toEqual([
    { command: "/usr/local/bin/fish", args: ["-ilc", expect.any(String)], timeoutMs: 5000 },
  ]);
});

test("a failing $SHELL falls back to the user's shell, then the platform default", async () => {
  const { probe: value, calls } = probe(
    "linux",
    { SHELL: "/broken/sh", PATH: "/usr/bin" },
    { "/bin/bash": () => captured("/home/me/.local/bin") },
    "/bin/zsh",
  );
  expect(await computeSearchPath(value)).toBe("/home/me/.local/bin:/usr/bin");
  expect(calls.map((call) => call.command)).toEqual(["/broken/sh", "/bin/zsh", "/bin/bash"]);
});

test("macOS asks launchctl when no login shell answers", async () => {
  const { probe: value, calls } = probe(
    "darwin",
    { PATH: "/usr/bin" },
    { "/bin/launchctl": () => "/opt/homebrew/bin:/usr/bin\n" },
  );
  expect(await computeSearchPath(value)).toBe("/opt/homebrew/bin:/usr/bin");
  expect(calls.at(-1)).toEqual({
    command: "/bin/launchctl",
    args: ["getenv", "PATH"],
    timeoutMs: 2000,
  });
});

test("without any capture, the inherited PATH is searched unchanged", async () => {
  const { probe: value } = probe("linux", { PATH: "/usr/bin:/bin" }, {});
  expect(await computeSearchPath(value)).toBe("/usr/bin:/bin");
});

test("registry output yields the Path value, expanding %NAME% without case", () => {
  const output =
    "\r\nHKEY_CURRENT_USER\\Environment\r\n    Path    REG_EXPAND_SZ    %USERPROFILE%\\bin;%Missing%\\x\r\n\r\n";
  const path = parseRegistryPath(output)!;
  expect(path).toBe("%USERPROFILE%\\bin;%Missing%\\x");
  expect(expandWindowsVariables(path, { UserProfile: "C:\\Users\\me" })).toBe(
    "C:\\Users\\me\\bin;%Missing%\\x",
  );
});

test("Windows searches the inherited PATH, then machine and user registry PATH, then known CLI folders", async () => {
  const env = {
    Path: "C:\\Windows\\System32",
    SystemRoot: "C:\\Windows",
    APPDATA: "C:\\Users\\me\\AppData\\Roaming",
    LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
    USERPROFILE: "C:\\Users\\me",
  };
  const registry = (path: string) => `    Path    REG_EXPAND_SZ    ${path}\r\n`;
  const { probe: value, calls } = probe("win32", env, {
    "C:\\Windows\\System32\\reg.exe": (args) =>
      args[1]!.startsWith("HKLM")
        ? registry("%SystemRoot%\\System32;C:\\Program Files\\Git\\cmd")
        : registry("%APPDATA%\\npm;C:\\Users\\me\\.cargo\\bin"),
  });
  expect((await computeSearchPath(value)).split(";")).toEqual([
    "C:\\Windows\\System32",
    "C:\\Program Files\\Git\\cmd",
    "C:\\Users\\me\\AppData\\Roaming\\npm",
    "C:\\Users\\me\\.cargo\\bin",
    "C:\\Users\\me\\AppData\\Local\\Programs\\nodejs",
    "C:\\Users\\me\\AppData\\Local\\Volta\\bin",
    "C:\\Users\\me\\AppData\\Local\\pnpm",
    "C:\\Users\\me\\.bun\\bin",
    "C:\\Users\\me\\.local\\bin",
    "C:\\Users\\me\\scoop\\shims",
  ]);
  expect(calls.every((call) => call.timeoutMs === 5000)).toBe(true);
});
