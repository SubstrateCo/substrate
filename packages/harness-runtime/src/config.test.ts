import type { HarnessConfiguration } from "@startup-os/contracts/harness";

import { materialize, nativeName } from "./config.ts";
import { safePath } from "./paths.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations. */

let root: string;
const configuration = (): HarnessConfiguration => ({
  organizationId: "org-a",
  agents: [
    {
      id: "agent-a",
      name: "Reviewer",
      harness: "antigravity",
      instructions: "Review only.",
      enabled: true,
      useStartupDefaults: true,
    },
  ],
});
const manifestPath = ".startup-os/harness/owned-files.json";
const profilePath = `agent-a/.agents/agents/${nativeName("agent-a")}.md`;

beforeEach(async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  root = await mkdtemp(join(tmpdir(), "opencode", "materialize-test-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function snapshot(directory: string, paths: string[]) {
  return Promise.all(
    paths.map(async (path) => {
      const target = join(directory, path);
      // A fixed old timestamp detects rewrites without sleeps or filesystem clock assumptions.
      await utimes(target, new Date("2001-01-01T00:00:00Z"), new Date("2001-01-01T00:00:00Z"));
      return { path, content: await readFile(target, "utf8"), mtime: (await stat(target)).mtimeMs };
    }),
  );
}

test("unchanged sync preserves managed contents and mtimes and creates no agent snapshot", async () => {
  const config = configuration();
  const directory = await materialize(root, config);
  const paths = [
    "agent-a/AGENTS.md",
    profilePath,
    manifestPath,
    "agent-a/.agents/skills/startup-os-default/SKILL.md",
  ];
  const snapshotPath = "agent-a/.startup-os/harness/agent-a/agent.json";
  if (await Bun.file(join(directory, snapshotPath)).exists()) paths.push(snapshotPath);
  const before = await snapshot(directory, paths);
  await materialize(root, config);
  const rewritten: string[] = [];
  for (const file of before) {
    expect(await readFile(join(directory, file.path), "utf8")).toBe(file.content);
    if ((await stat(join(directory, file.path))).mtimeMs !== file.mtime) rewritten.push(file.path);
  }
  expect(rewritten).toEqual([]);
  expect(await Bun.file(join(directory, snapshotPath)).exists()).toBe(false);
  expect(Object.keys(JSON.parse(await readFile(join(directory, manifestPath), "utf8")))).toEqual([
    "agent-a/AGENTS.md",
    profilePath,
  ]);
});

test("instruction changes update real native instructions and profiles, not unchanged default skills", async () => {
  const config = configuration();
  const directory = await materialize(root, config);
  const before = await snapshot(directory, [
    "agent-a/AGENTS.md",
    profilePath,
    manifestPath,
    "agent-a/.agents/skills/startup-os-default/SKILL.md",
  ]);
  config.agents[0].instructions = "Check linked source records.";
  config.agents[0].name = "Source reviewer";
  await materialize(root, config);
  for (const file of before.slice(0, 3)) {
    expect(await readFile(join(directory, file.path), "utf8")).toContain(
      "Check linked source records.",
    );
    expect((await stat(join(directory, file.path))).mtimeMs).not.toBe(file.mtime);
  }
  expect(await readFile(join(directory, profilePath), "utf8")).toContain(
    'description: "Source reviewer"',
  );
  expect(await readFile(join(directory, "agent-a/AGENTS.md"), "utf8")).toContain(
    'Agent: "Source reviewer"',
  );
  const skill = before[3];
  expect(await readFile(join(directory, skill.path), "utf8")).toBe(skill.content);
  expect((await stat(join(directory, skill.path))).mtimeMs).toBe(skill.mtime);
});

test("sync restores a missing owned file without rewriting unchanged files or manifest", async () => {
  const config = configuration();
  const directory = await materialize(root, config);
  const profile = await readFile(join(directory, profilePath), "utf8");
  const before = await snapshot(directory, ["agent-a/AGENTS.md", manifestPath]);
  await unlink(join(directory, profilePath));
  await materialize(root, config);
  expect(await readFile(join(directory, profilePath), "utf8")).toBe(profile);
  for (const file of before) {
    expect(await readFile(join(directory, file.path), "utf8")).toBe(file.content);
    expect((await stat(join(directory, file.path))).mtimeMs).toBe(file.mtime);
  }
});

test("unchanged sync and cleanup reject modified owned files without changing other managed files", async () => {
  const config = configuration();
  const directory = await materialize(root, config);
  await writeFile(join(directory, profilePath), "Local profile changes");
  const before = await snapshot(directory, ["agent-a/AGENTS.md", profilePath, manifestPath]);
  for (const agents of [config.agents, []]) {
    await expect(materialize(root, { ...config, agents })).rejects.toMatchObject({
      code: "configuration-conflict",
    });
    for (const file of before) {
      expect(await readFile(join(directory, file.path), "utf8")).toBe(file.content);
      expect((await stat(join(directory, file.path))).mtimeMs).toBe(file.mtime);
    }
  }
});

test("generic ownership cleanup removes inactive generated files and preserves native and unowned files", async () => {
  const config = configuration();
  const directory = await materialize(root, config);
  const protectedFiles = [
    "agent-a/.agents/agents/user.md",
    "agent-a/.agents/skills/review/SKILL.md",
    "agent-a/.agents/mcp_config.json",
    "agent-a/.native-sessions/conversation.jsonl",
    "agent-a/CLAUDE.md",
    "agent-a/.startup-os/harness/unowned/agent.json",
    "agent-b/AGENTS.md",
  ];
  for (const path of protectedFiles)
    await writeFile(await safePath(directory, path, false, true), `User content: ${path}`);
  // Exercise the existing manifest allowlist and cleanup, with no filename-specific migration.
  const obsolete = "agent-a/.startup-os/harness/agent-a/agent.json";
  await writeFile(await safePath(directory, obsolete, false, true), "previously owned content");
  const manifest = JSON.parse(await readFile(join(directory, manifestPath), "utf8"));
  await writeFile(
    join(directory, manifestPath),
    JSON.stringify({ ...manifest, [obsolete]: "previously owned content" }),
  );
  const before = await snapshot(directory, [
    ...protectedFiles,
    "agent-a/.agents/skills/startup-os-default/SKILL.md",
  ]);
  await materialize(root, { ...config, agents: [] });
  for (const path of ["agent-a/AGENTS.md", profilePath, obsolete])
    expect(await Bun.file(join(directory, path)).exists()).toBe(false);
  expect(await readFile(join(directory, manifestPath), "utf8")).toBe("{}");
  for (const file of before) {
    expect(await readFile(join(directory, file.path), "utf8")).toBe(file.content);
    expect((await stat(join(directory, file.path))).mtimeMs).toBe(file.mtime);
  }
});

test("unchanged sync still rejects symlinked targets and unexpected ownership paths", async () => {
  const config = configuration();
  const directory = await materialize(root, config);
  const outside = join(root, "outside.md");
  await writeFile(outside, "Outside content");
  await unlink(join(directory, profilePath));
  await symlink(outside, join(directory, profilePath));
  await expect(materialize(root, config)).rejects.toMatchObject({ code: "unsafe-path" });
  expect(await readFile(outside, "utf8")).toBe("Outside content");
  await writeFile(
    join(directory, manifestPath),
    JSON.stringify({ "../outside.md": "Outside content" }),
  );
  await expect(materialize(root, { ...config, agents: [] })).rejects.toMatchObject({
    code: "invalid-manifest",
  });
  expect(await readFile(outside, "utf8")).toBe("Outside content");
});
