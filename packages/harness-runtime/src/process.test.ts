import { findCommands, overrideEnvironment, windowsCommandExtensions } from "./process.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "find-commands-")));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function files(folder: string, names: string[]) {
  const directory = join(root, folder);
  await mkdir(directory, { recursive: true });
  for (const name of names) await writeFile(join(directory, name), "");
  return directory;
}

test("PATHEXT extensions are normalized and .ps1 is tried last", () => {
  expect(windowsCommandExtensions(".COM;EXE;;.Cmd")).toEqual([".com", ".exe", ".cmd", ".ps1"]);
  expect(windowsCommandExtensions(undefined)).toEqual([".com", ".exe", ".bat", ".cmd", ".ps1"]);
});

test("Windows lookup follows PATH order, then PATHEXT order, and ignores files without an extension", async () => {
  const npm = await files("npm", ["claude", "claude.cmd", "claude.ps1"]);
  const native = await files("native", ["claude.exe"]);
  expect(
    await findCommands("claude", `${npm};"${native}"`, { platform: "win32", pathext: ".EXE;.CMD" }),
  ).toEqual([join(npm, "claude.cmd"), join(npm, "claude.ps1"), join(native, "claude.exe")]);
});

test("Windows variable overrides replace every case variant of the name", () => {
  expect(
    overrideEnvironment({ Path: "C:\\old", TEMP: "C:\\tmp" }, { PATH: "C:\\new" }, "win32"),
  ).toEqual({ TEMP: "C:\\tmp", PATH: "C:\\new" });
  expect(overrideEnvironment({ Path: "/old" }, { PATH: "/new" }, "linux")).toEqual({
    Path: "/old",
    PATH: "/new",
  });
});
