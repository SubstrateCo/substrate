import { open } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Rust target triples that @openai/codex names its vendor folders after (bin/codex.js). */
const codexTriples = new Map([
  ["x64", "x86_64-pc-windows-msvc"],
  ["arm64", "aarch64-pc-windows-msvc"],
]);

const claudeLayout = (arch: string): string[][] => {
  const platformPackage = ["@anthropic-ai", `claude-code-win32-${arch}`];
  return [
    ["node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"],
    [
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "node_modules",
      ...platformPackage,
      "claude.exe",
    ],
    ["node_modules", ...platformPackage, "claude.exe"],
  ];
};

const codexLayout = (arch: string): string[][] => {
  const triple = codexTriples.get(arch);
  if (!triple) return [];
  const platformPackage = ["@openai", `codex-win32-${arch}`];
  const binary = ["vendor", triple, "bin", "codex.exe"];
  return [
    ["node_modules", "@openai", "codex", "node_modules", ...platformPackage, ...binary],
    ["node_modules", ...platformPackage, ...binary],
    ["node_modules", "@openai", "codex", ...binary],
  ];
};

/** CLIs whose npm package installs a native executable, by CLI name. */
const npmLayouts = new Map([
  ["claude", claudeLayout],
  ["codex", codexLayout],
]);

/**
 * Native executables of an npm global install, relative to the folder of its .cmd shim, in the
 * order to try. npm nests a package's optional dependencies under its own node_modules, and
 * older npm versions hoist them beside it.
 * - @anthropic-ai/claude-code install.cjs copies the platform package's claude.exe over the
 *   bin/claude.exe placeholder; the platform package keeps claude.exe at its root.
 * - @openai/codex bin/codex.js runs <platform package>/vendor/<triple>/bin/codex.exe and falls
 *   back to its own vendor folder.
 */
export function npmNativeCandidates(cli: string, arch: string): string[][] {
  return npmLayouts.get(cli)?.(arch) ?? [];
}

/** True for a Windows PE image. The claude-code placeholder is a script named claude.exe. */
async function isPortableExecutable(file: string): Promise<boolean> {
  try {
    const handle = await open(file, "r");
    try {
      const header = Buffer.alloc(2);
      const { bytesRead } = await handle.read(header, 0, 2, 0);
      return bytesRead === 2 && header.toString("latin1") === "MZ";
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

/**
 * The native executable behind an npm launcher shim (.cmd, .bat or .ps1). shell:false cannot
 * start the shim itself. Undefined when the install has no native executable.
 */
export async function followNpmShim(
  cli: string,
  shim: string,
  arch: string = process.arch,
): Promise<string | undefined> {
  for (const segments of npmNativeCandidates(cli, arch)) {
    const candidate = join(dirname(shim), ...segments);
    if (await isPortableExecutable(candidate)) return candidate;
  }
  return undefined;
}
