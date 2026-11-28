import {
  harnessKinds,
  type HarnessAgent,
  type HarnessConfiguration,
  type HarnessKind,
  type HarnessSkill,
  type ManagedSkill,
} from "@substrate/contracts/harness-runtime";

import { materialize, writeAgentFiles } from "./config.ts";
import { scanNativeSkills, saveNativeSkill } from "./native-config.ts";
import { agentDirectory } from "./paths.ts";
import { harnessDefinitions } from "./registry.ts";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
const skill = (id: string): HarnessSkill => ({
  id,
  name: id,
  description: `The ${id} workflow.`,
  content: `# ${id}\n\nUse the ${id} tools.\n`,
});
const skills = [skill("host-search"), skill("host-tasks"), skill("host-crm")];
const managed = (installed: (id: string) => boolean = () => true): ManagedSkill[] =>
  skills.map((entry) => ({ ...entry, installed: installed(entry.id) }));
const agent = (harness: HarnessKind, overrides: Partial<HarnessAgent> = {}): HarnessAgent => ({
  id: "agent-a",
  harness,
  instructions: "# Host\n\nReview only.",
  enabled: true,
  managedSkills: managed(),
  tools: null,
  ...overrides,
});
const configuration = (...agents: HarnessAgent[]): HarnessConfiguration => ({
  organizationId: "org-a",
  agents,
});
const read = (directory: string, path: string) => readFile(join(directory, path), "utf8");
const exists = (directory: string, path: string) => Bun.file(join(directory, path)).exists();
const byId = (list: HarnessSkill[]) => list.toSorted((a, b) => a.id.localeCompare(b.id));

beforeEach(async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  root = await mkdtemp(join(tmpdir(), "opencode", "materialize-test-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

for (const harness of harnessKinds) {
  test(`${harness} gets its own instructions file and scannable managed skills`, async () => {
    await materialize(root, configuration(agent(harness)));
    const directory = await agentDirectory(root, "org-a", "agent-a");
    const { instructions } = harnessDefinitions[harness];
    expect(await read(directory, instructions)).toBe("# Host\n\nReview only.\n");
    for (const other of ["AGENTS.md", "CLAUDE.md"].filter((name) => name !== instructions))
      expect(await exists(directory, other)).toBe(false);
    expect(byId(await scanNativeSkills(directory, harness))).toEqual(byId(skills));
  });
}

test("sync keeps the user's instructions but rewrites edited or missing managed skills", async () => {
  const config = configuration(agent("codex"));
  await materialize(root, config);
  const directory = await agentDirectory(root, "org-a", "agent-a");
  const [edited, removed] = skills;
  await writeFile(join(directory, "AGENTS.md"), "User prompt");
  await saveNativeSkill(directory, "codex", { ...edited!, content: "Stale tool names." });
  await unlink(join(directory, `.agents/skills/${removed!.id}/SKILL.md`));
  config.agents[0]!.instructions = "Check linked source records.";
  await materialize(root, config);
  expect(await read(directory, "AGENTS.md")).toBe("User prompt");
  expect(byId(await scanNativeSkills(directory, "codex"))).toEqual(byId(skills));
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

test("without installed skills, only the instructions are seeded", async () => {
  await materialize(
    root,
    configuration(
      agent("codex", { instructions: "Review only.", managedSkills: managed(() => false) }),
    ),
  );
  const directory = await agentDirectory(root, "org-a", "agent-a");
  expect(await read(directory, "AGENTS.md")).toBe("Review only.\n");
  expect(await scanNativeSkills(directory, "codex")).toEqual([]);
});

test("reset replaces only managed files with the current agent", async () => {
  await materialize(root, configuration(agent("claude")));
  const directory = await agentDirectory(root, "org-a", "agent-a");
  await writeFile(join(directory, "CLAUDE.md"), "User prompt");
  const userSkill = { id: "review", name: "review", description: "Mine", content: "Keep me." };
  await saveNativeSkill(directory, "claude", userSkill);
  await writeAgentFiles(directory, agent("claude", { instructions: "Updated." }), {
    replaceInstructions: true,
  });
  expect(await read(directory, "CLAUDE.md")).toBe("Updated.\n");
  expect(await scanNativeSkills(directory, "claude")).toContainEqual(userSkill);
});

test("the managed prefix starts the instructions file", async () => {
  const directory = await agentDirectory(root, "org-a", "agent-a");
  await writeAgentFiles(directory, agent("opencode"), { managedPrefix: "# Policy\n" });
  expect(await read(directory, "AGENTS.md")).toBe("# Policy\n\n# Host\n\nReview only.\n");
});

test("defaults are never written through a symlink", async () => {
  const directory = await agentDirectory(root, "org-a", "agent-a");
  const outside = join(root, "outside.md");
  await writeFile(outside, "Outside content");
  await symlink(outside, join(directory, "CLAUDE.md"));
  await rejects(materialize(root, configuration(agent("claude"))), {
    code: "unsafe-path",
  });
  await rejects(writeAgentFiles(directory, agent("claude"), { replaceInstructions: true }), {
    code: "unsafe-path",
  });
  expect(await readFile(outside, "utf8")).toBe("Outside content");
});

test("skills that are no longer installed lose only their owned files", async () => {
  const config = configuration(agent("codex"));
  await materialize(root, config);
  const directory = await agentDirectory(root, "org-a", "agent-a");
  const tasks = ".agents/skills/host-tasks";
  await writeFile(join(directory, tasks, "notes.md"), "User notes");
  await writeFile(join(directory, ".agents/skills/host-crm/SKILL.md"), "User file");
  config.agents[0]!.managedSkills = managed((id) => id === "host-search");
  await materialize(root, config);
  expect(await exists(directory, `${tasks}/SKILL.md`)).toBe(false);
  expect(await read(directory, `${tasks}/notes.md`)).toBe("User notes");
  expect(await read(directory, ".agents/skills/host-crm/SKILL.md")).toBe("User file");
  expect(await exists(directory, ".agents/skills/host-search/SKILL.md")).toBe(true);
});
