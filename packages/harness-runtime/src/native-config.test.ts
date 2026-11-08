import type { HarnessConfiguration, HarnessKind } from "@startup-os/contracts/harness";

import { materialize, nativeName, startupSkill } from "./config.ts";
import { createHarnessHost } from "./host.ts";
import {
  editNativeServer,
  saveNativeSkill,
  scanNativeServers,
  scanNativeSkills,
} from "./native-config.ts";
import { agentDirectory, organizationDirectory, safePath } from "./paths.ts";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* oxlint-disable typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations. */

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
      harness: "antigravity",
      instructions: "Review only.",
      enabled: true,
      useStartupDefaults: true,
    },
  ],
});

describe("native skill files", () => {
  test("skills-only discovery does not read unrelated MCP configuration", async () => {
    const host = await createHarnessHost({ accountDirectory: root });
    try {
      await host.configure(config());
      const directory = await agentDirectory(root, "org-a", "agent-a");
      await host.saveSkill({
        organizationId: "org-a",
        agentId: "agent-a",
        harness: "opencode",
        skill: {
          id: "review",
          name: "review",
          description: "Review work.",
          content: "Check source context.",
        },
      });
      await writeFile(join(directory, "opencode.json"), "{invalid native MCP configuration");
      const result = await host.scanSkills({
        organizationId: "org-a",
        agentId: "agent-a",
        harness: "opencode",
      });
      expect(result.skills.map((skill) => skill.name)).toEqual(["review"]);
      expect(await readFile(join(directory, "opencode.json"), "utf8")).toBe(
        "{invalid native MCP configuration",
      );
    } finally {
      await host.dispose();
    }
  });
  test("scanning a missing native folder is read-only", async () => {
    const directory = await organizationDirectory(root, "org-a");
    expect(await scanNativeSkills(directory, "claude")).toEqual([]);
    expect(await scanNativeServers(directory, "opencode")).toEqual([]);
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

  test("defaults do not replace a colliding native skill", async () => {
    const directory = await agentDirectory(root, "org-a", "agent-a");
    await saveNativeSkill(directory, "antigravity", { ...startupSkill, content: "User-owned" });
    await expect(materialize(root, config())).rejects.toMatchObject({
      code: "configuration-conflict",
    });
    expect((await scanNativeSkills(directory, "antigravity"))[0].content).toBe("User-owned");
  });

  test("sync removes only owned inactive agent profiles, not native history", async () => {
    const configuration = config();
    await materialize(root, configuration);
    const directory = await agentDirectory(root, "org-a", "agent-a");
    await materialize(root, configuration);
    await writeFile(
      await safePath(directory, ".agents/agents/user.md", false, true),
      "user profile",
    );
    await writeFile(
      await safePath(directory, ".native-sessions/conversation.jsonl", false, true),
      "native history",
    );
    await materialize(root, { ...configuration, agents: [] });
    expect(await readdir(join(directory, ".agents", "agents"))).toEqual(["user.md"]);
    expect(await readFile(join(directory, ".native-sessions", "conversation.jsonl"), "utf8")).toBe(
      "native history",
    );
    expect(
      await Bun.file(join(directory, ".startup-os", "harness", "agent-a", "agent.json")).exists(),
    ).toBe(false);
  });

  test("modified owned profiles are never overwritten or deleted", async () => {
    const configuration = config();
    await materialize(root, configuration);
    const directory = await agentDirectory(root, "org-a", "agent-a");
    const path = join(directory, ".agents", "agents", `${nativeName("agent-a")}.md`);
    await writeFile(path, "User changed this profile");
    await expect(materialize(root, { ...configuration, agents: [] })).rejects.toMatchObject({
      code: "configuration-conflict",
    });
    expect(await readFile(path, "utf8")).toBe("User changed this profile");
  });
});

describe("native MCP files", () => {
  for (const harness of ["opencode", "antigravity", "claude", "codex"] satisfies HarnessKind[]) {
    test(`${harness} writes actual native configuration and round-trips without a catalog`, async () => {
      const directory = await organizationDirectory(root, "org-a");
      await editNativeServer(directory, harness, "local-tools", {
        id: "local-tools",
        name: "Local tools",
        transport: "stdio",
        command: "native-tool",
        args: ["--verbose"],
      });
      const [server] = await scanNativeServers(directory, harness);
      expect(server).toMatchObject({
        id: "local-tools",
        transport: "stdio",
        command: "native-tool",
        args: ["--verbose"],
        readOnly: false,
      });
      await editNativeServer(directory, harness, "local-tools", {
        id: "local-tools",
        name: "Local tools",
        transport: "stdio",
        command: "new-tool",
        args: [],
      });
      expect((await scanNativeServers(directory, harness))[0].command).toBe("new-tool");
      await editNativeServer(directory, harness, "local-tools");
      expect(await scanNativeServers(directory, harness)).toEqual([]);
    });
  }

  test("JSONC comments and unrelated credentials survive another server edit", async () => {
    const directory = await organizationDirectory(root, "org-a");
    const path = join(directory, "opencode.jsonc");
    await writeFile(
      path,
      '{\n // retain this comment\n "model":"provider/model",\n "mcp":{"servers":{"private":{"type":"remote","url":"https://private.example/mcp","headers":{"Authorization":"Bearer secret-value"}}}}\n}',
    );
    await editNativeServer(directory, "opencode", "public", {
      id: "public",
      name: "Public",
      transport: "http",
      url: "https://public.example/mcp",
    });
    const text = await readFile(path, "utf8");
    expect(text).toContain("// retain this comment");
    expect(text).toContain("Bearer secret-value");
    const scanned = await scanNativeServers(directory, "opencode");
    expect(JSON.stringify(scanned)).not.toContain("secret-value");
    expect(scanned.find((entry) => entry.id === "private")?.readOnly).toBe(true);
  });

  test("TOML unrelated settings and native OAuth environment references survive edits", async () => {
    const directory = await organizationDirectory(root, "org-a");
    const path = await safePath(directory, ".codex/config.toml", false, true);
    await writeFile(
      path,
      '# retain this native comment\nmodel = "native-model"\n[mcp_servers.private]\nurl = "https://private.example/mcp"\nbearer_token_env_var = "NATIVE_SECRET"\n',
    );
    await editNativeServer(directory, "codex", "public", {
      id: "public",
      name: "Public",
      transport: "http",
      url: "https://public.example/mcp",
    });
    const text = await readFile(path, "utf8");
    expect(text).toContain('model = "native-model"');
    expect(text).toContain("# retain this native comment");
    expect(text).toContain('bearer_token_env_var = "NATIVE_SECRET"');
    expect(JSON.stringify(await scanNativeServers(directory, "codex"))).not.toContain(
      "NATIVE_SECRET",
    );
  });

  test("rejects credential writes and URL credentials", async () => {
    const directory = await organizationDirectory(root, "org-a");
    await expect(
      editNativeServer(directory, "claude", "private", {
        id: "private",
        name: "Private",
        transport: "stdio",
        command: "tool",
        environment: { API_KEY: "secret" },
      }),
    ).rejects.toMatchObject({ code: "secret-configuration" });
    await expect(
      editNativeServer(directory, "claude", "private", {
        id: "private",
        name: "Private",
        transport: "http",
        url: "https://user:pass@example.com/mcp",
      }),
    ).rejects.toMatchObject({ code: "invalid-mcp-url" });
  });
});

test("host scopes local file operations to a safe organization ID", async () => {
  const host = await createHarnessHost({ accountDirectory: root });
  try {
    await host.configure(config());
    await expect(
      host.scanConfiguration({ organizationId: "../org-a", agentId: "agent-a", harness: "claude" }),
    ).rejects.toMatchObject({ code: "invalid-id" });
    await expect(
      host.saveSkill({
        organizationId: "org-a",
        agentId: "agent-a",
        harness: "claude",
        skill: { id: "../escape", name: "Escape", description: "", content: "unsafe" },
      }),
    ).rejects.toMatchObject({ code: "invalid-id" });
    await host.configure({ organizationId: "org-a", agents: [] });
    await expect(
      host.execute({ type: "start", organizationId: "org-a", agentId: "agent-a" }),
    ).rejects.toMatchObject({ code: "agent-not-found" });
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
  await expect(
    saveNativeSkill(directory, "claude", {
      id: "escape",
      name: "escape",
      description: "",
      content: "unsafe",
    }),
  ).rejects.toMatchObject({ code: "unsafe-path" });
  expect(await readdir(other)).toEqual([]);
});

test("reopens metadata and synchronizes edited actors without replacing local native files", async () => {
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
    await first.saveMcpServer({
      ...scope,
      server: {
        id: "local-tools",
        name: "local-tools",
        transport: "stdio",
        command: "local-tools",
        args: ["--read-only"],
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
    expect(local.mcpServers.find((server) => server.id === "local-tools")?.args).toEqual([
      "--read-only",
    ]);
    expect(local.skills.find((skill) => skill.id === startupSkill.id)?.content).toBe(
      startupSkill.content,
    );
    expect(
      await readFile(
        join(
          root,
          "orgs",
          configuration.organizationId,
          "claude-agent",
          ".startup-os",
          "harness",
          "claude-agent",
          "agent.json",
        ),
        "utf8",
      ),
    ).toContain("Edited Claude instructions");
  } finally {
    await second.dispose();
  }
});
