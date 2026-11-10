import {
  startupSkills,
  harnessKinds,
  type HarnessAgent,
  type HarnessConfiguration,
  type HarnessKind,
  type HarnessSkill,
} from "@startup-os/contracts/harness";

import { materialize, writeDefaultFiles } from "./config.ts";
import { scanNativeSkills, saveNativeSkill } from "./native-config.ts";
import { agentDirectory } from "./paths.ts";
import { harnessDefinitions } from "./registry.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations. */

let root: string;
const agent = (harness: HarnessKind, overrides: Partial<HarnessAgent> = {}): HarnessAgent => ({
  id: "agent-a",
  name: "Reviewer",
  harness,
  instructions: "Review only.",
  enabled: true,
  useStartupDefaults: true,
  ...overrides,
});
const configuration = (...agents: HarnessAgent[]): HarnessConfiguration => ({
  organizationId: "org-a",
  agents,
});
const read = (directory: string, path: string) => readFile(join(directory, path), "utf8");
const exists = (directory: string, path: string) => Bun.file(join(directory, path)).exists();
const byId = (skills: HarnessSkill[]) => skills.toSorted((a, b) => a.id.localeCompare(b.id));

beforeEach(async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  root = await mkdtemp(join(tmpdir(), "opencode", "materialize-test-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

for (const harness of harnessKinds) {
  test(`${harness} gets its own instructions file and a scannable default skill`, async () => {
    await materialize(root, configuration(agent(harness)));
    const directory = await agentDirectory(root, "org-a", "agent-a");
    const { instructions } = harnessDefinitions[harness];
    const prompt = await read(directory, instructions);
    expect(prompt).toContain("Organization ID: org-a");
    expect(prompt).toContain("Review only.");
    expect(prompt).toContain(
      "Always create skills in the local project folder, never in a global or user-level skills folder.",
    );
    for (const other of ["AGENTS.md", "CLAUDE.md"].filter((name) => name !== instructions))
      expect(await exists(directory, other)).toBe(false);
    expect(byId(await scanNativeSkills(directory, harness))).toEqual(byId(startupSkills));
  });
}

test("sync keeps the user's instructions but rewrites edited or missing Startup OS skills", async () => {
  const config = configuration(agent("antigravity"));
  await materialize(root, config);
  const directory = await agentDirectory(root, "org-a", "agent-a");
  const [edited, removed] = startupSkills;
  await writeFile(join(directory, "AGENTS.md"), "User prompt");
  await saveNativeSkill(directory, "antigravity", { ...edited!, content: "Stale tool names." });
  await unlink(join(directory, `.agents/skills/${removed!.id}/SKILL.md`));
  config.agents[0].instructions = "Check linked source records.";
  await materialize(root, config);
  expect(await read(directory, "AGENTS.md")).toBe("User prompt");
  expect(byId(await scanNativeSkills(directory, "antigravity"))).toEqual(byId(startupSkills));
});

test("disabling or removing an agent leaves its files in place", async () => {
  const config = configuration(agent("claude"));
  await materialize(root, config);
  const directory = await agentDirectory(root, "org-a", "agent-a");
  const before = await read(directory, "CLAUDE.md");
  await materialize(root, configuration(agent("claude", { enabled: false })));
  await materialize(root, configuration());
  expect(await read(directory, "CLAUDE.md")).toBe(before);
});

test("without Startup OS defaults, only the agent instructions are seeded", async () => {
  await materialize(root, configuration(agent("codex", { useStartupDefaults: false })));
  const directory = await agentDirectory(root, "org-a", "agent-a");
  expect(await read(directory, "AGENTS.md")).toBe("Review only.\n");
  expect(await scanNativeSkills(directory, "codex")).toEqual([]);
});

test("reset replaces only Startup OS files with the current agent", async () => {
  await materialize(root, configuration(agent("claude")));
  const directory = await agentDirectory(root, "org-a", "agent-a");
  await writeFile(join(directory, "CLAUDE.md"), "User prompt");
  const userSkill = { id: "review", name: "review", description: "Mine", content: "Keep me." };
  await saveNativeSkill(directory, "claude", userSkill);
  await writeDefaultFiles(directory, "org-a", agent("claude", { instructions: "Updated." }), {
    replace: true,
  });
  expect(await read(directory, "CLAUDE.md")).toContain("Updated.");
  expect(await scanNativeSkills(directory, "claude")).toContainEqual(userSkill);
});

test("defaults are never written through a symlink", async () => {
  const directory = await agentDirectory(root, "org-a", "agent-a");
  const outside = join(root, "outside.md");
  await writeFile(outside, "Outside content");
  await symlink(outside, join(directory, "CLAUDE.md"));
  await expect(materialize(root, configuration(agent("claude")))).rejects.toMatchObject({
    code: "unsafe-path",
  });
  await expect(
    writeDefaultFiles(directory, "org-a", agent("claude"), { replace: true }),
  ).rejects.toMatchObject({
    code: "unsafe-path",
  });
  expect(await readFile(outside, "utf8")).toBe("Outside content");
});
