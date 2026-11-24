import { offloadOutput } from "./offload.ts";
import { helperDirectory } from "./paths.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdir, mkdtemp, readdir, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("an offloaded page names its cursor, which the preview would cut off", async () => {
  const page = await offloadOutput(root, turnId, "list_projects", 1, {
    ...large,
    nextCursor: "page-2",
  });
  expect(page?.summary.slice(0, 300)).toContain('200 items, nextCursor: "page-2"');

  const message = (index: number) => ({
    id: crypto.randomUUID(),
    author: {
      id: crypto.randomUUID(),
      name: "Alice",
      type: "human" as const,
      kind: "owner" as const,
    },
    body: `Reply ${index} ${"x".repeat(80)}`,
    createdAt: "2026-11-24T12:00:00.000Z",
    records: [],
  });
  const thread = await offloadOutput(root, turnId, "read_thread", 2, {
    conversationId: crypto.randomUUID(),
    root: message(0),
    replies: { items: Array.from({ length: 200 }, (_, index) => message(index)), nextCursor: null },
  });
  expect(thread?.summary.slice(0, 300)).toContain("replies: 200 items, nextCursor: null");
});

test("offload refuses path segments and redirected folders", async () => {
  await rejects(offloadOutput(root, "../escape", "get_me", 1, large), {
    code: "invalid-id",
  });
  await rejects(offloadOutput(root, turnId, "../../x", 1, large), {
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
  await rejects(offloadOutput(folder, turnId, "get_me", 1, large), {
    code: "unsafe-path",
  });
  expect(await readdir(outside)).toEqual([]);
});

test("helper folders sit under _helpers and reject unsafe IDs", async () => {
  const path = await helperDirectory(root, "org-a", "agent-a", "helper-1");
  expect(path).toBe(join(await realpath(root), "orgs", "org-a", "_helpers", "agent-a", "helper-1"));
  await rejects(helperDirectory(root, "org-a", "agent-a", ".."), {
    code: "invalid-id",
  });
  await rejects(helperDirectory(root, "org-a", "../org-b", "helper-1"), {
    code: "invalid-id",
  });
});
