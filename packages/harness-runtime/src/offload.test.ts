import { offloadOutput } from "./offload.ts";
import { helperDirectory } from "./paths.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations. */

let root: string;
const turnId = "0d6f4c3e-8b4f-4c39-9d7e-3f1c2a5b6e71";
const large = {
  items: Array.from({ length: 200 }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `Project ${index} ${"x".repeat(40)}`,
  })),
  nextCursor: null,
};

beforeEach(async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  root = await mkdtemp(join(tmpdir(), "opencode", "offload-test-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

test("small outputs stay inline", async () => {
  expect(
    await offloadOutput(root, turnId, "list_projects", 1, { items: [], nextCursor: null }),
  ).toBeUndefined();
  expect(await readdir(root)).toEqual([]);
});

test("offload refuses path segments and redirected folders", async () => {
  await expect(offloadOutput(root, "../escape", "get_me", 1, large)).rejects.toMatchObject({
    code: "invalid-id",
  });
  await expect(offloadOutput(root, turnId, "../../x", 1, large)).rejects.toMatchObject({
    code: "invalid-id",
  });
  const outside = join(root, "outside");
  const folder = join(root, "folder");
  await mkdir(outside);
  await mkdir(folder);
  await symlink(
    outside,
    join(folder, ".substrate"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(offloadOutput(folder, turnId, "get_me", 1, large)).rejects.toMatchObject({
    code: "unsafe-path",
  });
  expect(await readdir(outside)).toEqual([]);
});

test("helper folders sit under _helpers and reject unsafe IDs", async () => {
  const path = await helperDirectory(root, "org-a", "agent-a", "helper-1");
  expect(path).toBe(join(await realpath(root), "orgs", "org-a", "_helpers", "agent-a", "helper-1"));
  await expect(helperDirectory(root, "org-a", "agent-a", "..")).rejects.toMatchObject({
    code: "invalid-id",
  });
  await expect(helperDirectory(root, "org-a", "../org-b", "helper-1")).rejects.toMatchObject({
    code: "invalid-id",
  });
});
