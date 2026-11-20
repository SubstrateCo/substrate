import { startupSkills, type HarnessConfiguration } from "@substrate/contracts/harness";

import { createHarnessHost } from "./host.ts";
import { saveNativeSkill, scanNativeSkills } from "./native-config.ts";
import { organizationDirectory, safePath } from "./paths.ts";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root: string;
beforeEach(async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  root = await mkdtemp(join(tmpdir(), "opencode", "harness-test-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const config = (): HarnessConfiguration => ({
  organizationId: "org-a",
  agents: [
    {
      id: "agent-a",
      name: "Reviewer",
      harness: "codex",
      instructions: "Review only.",
      enabled: true,
      useStartupDefaults: true,
    },
  ],
});

describe("native skill files", () => {
  test("scanning a missing native folder is read-only", async () => {
    const directory = await organizationDirectory(root, "org-a");
    expect(await scanNativeSkills(directory, "claude")).toEqual([]);
    expect(await readdir(directory)).toEqual([]);
  });

  test("reads YAML block scalars and preserves unrelated metadata on save", async () => {
    const directory = await organizationDirectory(root, "org-a");
    const path = await safePath(directory, ".claude/skills/review/SKILL.md", false, true);
    await writeFile(
      path,
      "---\nname: review\ndescription: >-\n  Review changes\n  carefully.\nallowed-tools: Read\n---\n\nOriginal body",
    );
    const [skill] = await scanNativeSkills(directory, "claude");
    expect(skill.description).toBe("Review changes carefully.");
    await saveNativeSkill(directory, "claude", { ...skill, content: "Updated body" });
    expect(await readFile(path, "utf8")).toContain("allowed-tools: Read");
    expect((await scanNativeSkills(directory, "claude"))[0].content).toBe("Updated body");
  });
});

test("host scopes local file operations to a safe organization ID", async () => {
  const host = await createHarnessHost({ accountDirectory: root });
  try {
    await host.configure(config());
    await rejects(
      host.scanConfiguration({ organizationId: "../org-a", agentId: "agent-a", harness: "claude" }),
      { code: "invalid-id" },
    );
    await rejects(
      host.saveSkill({
        organizationId: "org-a",
        agentId: "agent-a",
        harness: "claude",
        skill: { id: "../escape", name: "Escape", description: "", content: "unsafe" },
      }),
      { code: "invalid-id" },
    );
    await host.configure({ organizationId: "org-a", agents: [] });
    await rejects(
      host.execute({
        type: "open",
        organizationId: "org-a",
        sessionId: "session-a",
        agentId: "agent-a",
        epoch: 0,
        folder: "main",
        prefix: "",
        mcpServers: [],
      }),
      { code: "agent-not-found" },
    );
  } finally {
    await host.dispose();
  }
});

test("rejects a junction that redirects managed writes outside the organization", async () => {
  const directory = await organizationDirectory(root, "org-a");
  const other = await organizationDirectory(root, "org-b");
  await symlink(
    other,
    join(directory, ".claude"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await rejects(
    saveNativeSkill(directory, "claude", {
      id: "escape",
      name: "escape",
      description: "",
      content: "unsafe",
    }),
    { code: "unsafe-path" },
  );
  expect(await readdir(other)).toEqual([]);
});

test("recreates the host and synchronizes edited actors without replacing local native files", async () => {
  const first = await createHarnessHost({ accountDirectory: root });
  const configuration: HarnessConfiguration = {
    organizationId: "restart-org",
    agents: [
      {
        id: "opencode-agent",
        name: "OpenCode agent",
        harness: "opencode",
        instructions: "Initial instructions",
        enabled: true,
        useStartupDefaults: true,
      },
      {
        id: "claude-agent",
        name: "Claude agent",
        harness: "claude",
        instructions: "Initial Claude instructions",
        enabled: true,
        useStartupDefaults: true,
      },
    ],
  };
  const scope = {
    organizationId: configuration.organizationId,
    agentId: "opencode-agent",
    harness: "opencode" as const,
  };
  try {
    await first.configure(configuration);
    await first.saveSkill({
      ...scope,
      skill: {
        id: "native-review",
        name: "native-review",
        description: "Native review",
        content: "Saved locally",
      },
    });
    configuration.agents[1].instructions = "Edited Claude instructions";
    await first.configure(configuration);
  } finally {
    await first.dispose();
  }
  const second = await createHarnessHost({ accountDirectory: root });
  try {
    await second.configure(configuration);
    const local = await second.scanConfiguration(scope);
    expect(local.skills.find((skill) => skill.id === "native-review")?.content).toBe(
      "Saved locally",
    );
    for (const skill of startupSkills)
      expect(local.skills.find((item) => item.id === skill.id)?.content).toBe(skill.content);
    const claudePrompt = join(
      root,
      "orgs",
      configuration.organizationId,
      "claude-agent",
      "CLAUDE.md",
    );
    // Sync seeds files once; later instruction edits apply only on reset.
    expect(await readFile(claudePrompt, "utf8")).toContain("Initial Claude instructions");
    await second.resetDefaults({
      organizationId: configuration.organizationId,
      agentId: "claude-agent",
      harness: "claude",
    });
    expect(await readFile(claudePrompt, "utf8")).toContain("Edited Claude instructions");
    await rejects(
      second.resetDefaults({
        organizationId: configuration.organizationId,
        agentId: "claude-agent",
        harness: "codex",
      }),
      { code: "agent-not-found" },
    );
  } finally {
    await second.dispose();
  }
});
