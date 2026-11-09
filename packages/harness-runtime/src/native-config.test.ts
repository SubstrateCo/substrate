import {
  startupSkills,
  harnessKinds,
  type HarnessConfiguration,
} from "@startup-os/contracts/harness";

import { createHarnessHost } from "./host.ts";
import {
  editNativeServer,
  saveNativeSkill,
  scanNativeServers,
  scanNativeSkills,
} from "./native-config.ts";
import { organizationDirectory, safePath } from "./paths.ts";
import { createMemoryStorage } from "./test-support.ts";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs/promises";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";

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
});

describe("native MCP files", () => {
  for (const harness of harnessKinds) {
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
      expect((await scanNativeServers(directory, harness))[0]).toMatchObject({
        command: "new-tool",
      });
      await editNativeServer(directory, harness, "local-tools");
      expect(await scanNativeServers(directory, harness)).toEqual([]);
    });
  }

  test("HTTP MCP servers use each harness's native transport fields", async () => {
    const directory = await organizationDirectory(root, "org-a");
    for (const harness of harnessKinds)
      await editNativeServer(directory, harness, "tools", {
        id: "tools",
        name: "Tools",
        transport: "http",
        url: "https://tools.example/mcp",
      });
    expect(JSON.parse(await readFile(join(directory, "opencode.json"), "utf8"))).toEqual({
      mcp: { servers: { tools: { type: "remote", url: "https://tools.example/mcp" } } },
    });
    expect(JSON.parse(await readFile(join(directory, ".mcp.json"), "utf8"))).toEqual({
      mcpServers: { tools: { type: "http", url: "https://tools.example/mcp" } },
    });
    expect(JSON.parse(await readFile(join(directory, ".agents/mcp_config.json"), "utf8"))).toEqual({
      mcpServers: { tools: { httpUrl: "https://tools.example/mcp" } },
    });
    expect(parse(await readFile(join(directory, ".codex/config.toml"), "utf8"))).toEqual({
      mcp_servers: { tools: { url: "https://tools.example/mcp" } },
    });
  });

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

  test("an edit reads each native MCP candidate file once", async () => {
    const directory = await organizationDirectory(root, "org-a");
    await writeFile(
      join(directory, "opencode.json"),
      '{"mcp":{"servers":{"tools":{"type":"local","command":["tool"]}}}}',
    );
    const reads = spyOn(fs, "readFile");
    try {
      await editNativeServer(directory, "opencode", "tools", {
        id: "tools",
        name: "tools",
        transport: "stdio",
        command: "new-tool",
      });
      expect(reads).toHaveBeenCalledTimes(4);
    } finally {
      reads.mockRestore();
    }
    expect((await scanNativeServers(directory, "opencode"))[0]).toMatchObject({
      command: "new-tool",
    });
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
  const host = await createHarnessHost({ accountDirectory: root, storage: createMemoryStorage() });
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

test("recreates the host and synchronizes edited actors without replacing local native files", async () => {
  const storage = createMemoryStorage();
  const first = await createHarnessHost({ accountDirectory: root, storage });
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
  const second = await createHarnessHost({ accountDirectory: root, storage });
  try {
    await second.configure(configuration);
    const local = await second.scanConfiguration(scope);
    expect(local.skills.find((skill) => skill.id === "native-review")?.content).toBe(
      "Saved locally",
    );
    expect(local.mcpServers.find((server) => server.id === "local-tools")?.args).toEqual([
      "--read-only",
    ]);
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
    await expect(
      second.resetDefaults({
        organizationId: configuration.organizationId,
        agentId: "claude-agent",
        harness: "codex",
      }),
    ).rejects.toMatchObject({ code: "agent-not-found" });
  } finally {
    await second.dispose();
  }
});
