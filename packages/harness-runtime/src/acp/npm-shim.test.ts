import { followNpmShim } from "./npm-shim.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

let root: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "npm-shim-")));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const shim = (name: string) => join(root, `${name}.cmd`);

/** A file under the npm folder; "MZ" marks a Windows executable image. */
async function place(segments: string[], content: string) {
  const file = join(root, ...segments);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
  return file;
}

const claudePackage = ["node_modules", "@anthropic-ai", "claude-code"];

test("claude resolves to the native bin/claude.exe that postinstall wrote", async () => {
  const native = await place([...claudePackage, "bin", "claude.exe"], "MZ native");
  expect(await followNpmShim("claude", shim("claude"), "x64")).toBe(native);
});

test("the claude placeholder script falls through to the platform package", async () => {
  await place([...claudePackage, "bin", "claude.exe"], 'echo "Error: claude native binary"');
  const native = await place(
    [...claudePackage, "node_modules", "@anthropic-ai", "claude-code-win32-arm64", "claude.exe"],
    "MZ native",
  );
  expect(await followNpmShim("claude", shim("claude"), "arm64")).toBe(native);
});

test("codex resolves to a hoisted platform package's vendor binary", async () => {
  const native = await place(
    [
      "node_modules",
      "@openai",
      "codex-win32-x64",
      "vendor",
      "x86_64-pc-windows-msvc",
      "bin",
      "codex.exe",
    ],
    "MZ native",
  );
  expect(await followNpmShim("codex", shim("codex"), "x64")).toBe(native);
});

test("codex falls back to the vendor folder inside @openai/codex", async () => {
  const native = await place(
    ["node_modules", "@openai", "codex", "vendor", "aarch64-pc-windows-msvc", "bin", "codex.exe"],
    "MZ native",
  );
  expect(await followNpmShim("codex", shim("codex"), "arm64")).toBe(native);
});

test("a shim without a native executable resolves to nothing", async () => {
  await place([...claudePackage, "cli.js"], "console.log()");
  expect(await followNpmShim("claude", shim("claude"), "x64")).toBeUndefined();
  expect(await followNpmShim("opencode", shim("opencode"), "x64")).toBeUndefined();
});
