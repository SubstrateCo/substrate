import type { AgentConfiguration } from "@substrate/contracts/agents";
import type { HarnessMcpServer } from "@substrate/contracts/harness-runtime";

import { prepareLocalInput, prepareMcpServerSave } from "./local-configuration.ts";
import { fixture } from "./test-support.ts";
import { describe, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const agent: AgentConfiguration = {
  id: "agent-1",
  name: "Agent",
  instructions: "",
  harness: "opencode",
  enabled: true,
  disabledApps: [],
  substrateGuide: true,
  avatar: "100000",
};

describe("desktop harness local configuration", () => {
  test("catalog installs use the verified organization and reject renderer paths", async () => {
    const f = fixture(undefined, [], { agents: [agent] });
    try {
      await f.controller.run("synchronize");
      await f.controller.run("installSkillPackage", {
        agentId: agent.id,
        harness: "opencode",
        source: "owner/repository",
        name: "review",
      });
      expect(f.calls.at(-1)).toEqual({
        method: "installSkillPackage",
        value: {
          organizationId: "org-1",
          agentId: agent.id,
          harness: "opencode",
          source: "owner/repository",
          name: "review",
        },
      });
      for (const source of ["../../private", "https://github.com/owner/repo", "C:/private"]) {
        await rejects(
          f.controller.run("installSkillPackage", {
            agentId: agent.id,
            harness: "opencode",
            source,
            name: "review",
          }),
        );
      }
      expect(f.calls.filter((call) => call.method === "installSkillPackage")).toHaveLength(1);
    } finally {
      f.controller.disconnect();
    }
  });

  test("catalog mutations cannot run for an agent homed on another desktop", async () => {
    const f = fixture(undefined, [], { agents: [agent], homedElsewhere: [agent.id] });
    try {
      await f.controller.run("synchronize");
      await rejects(
        f.controller.run("installSkillPackage", {
          agentId: agent.id,
          harness: "opencode",
          source: "owner/repository",
          name: "review",
        }),
        { code: "agent-not-home" },
      );
      await rejects(
        f.controller.run("updateSkillPackages", {
          agentId: agent.id,
          harness: "opencode",
          scheduled: false,
        }),
        { code: "agent-not-home" },
      );
      expect(f.calls.some((call) => call.method === "installSkillPackage")).toBe(false);
      expect(f.calls.some((call) => call.method === "updateSkillPackages")).toBe(false);
    } finally {
      f.controller.disconnect();
    }
  });
  test("local configuration rejects paths, traversal, organization selection, and embedded credentials", () => {
    for (const [method, value] of [
      ["scanConfiguration", { harness: "codex" }],
      ["scanConfiguration", { agentId: "../agent", harness: "codex" }],
      ["scanConfiguration", { agentId: "agent-1", harness: "codex", organizationId: "other-org" }],
      ["scanConfiguration", { agentId: "agent-1", harness: "codex", directory: "C:/other" }],
      ["deleteSkill", { agentId: "agent-1", harness: "codex", id: "../notes" }],
      [
        "saveSkill",
        { agentId: "agent-1", harness: "codex", name: "../notes", description: "", content: "" },
      ],
    ] as const)
      expect(() => prepareLocalInput(method, value, "org")).toThrow();
    for (const value of [
      {
        agentId: "agent-1",
        harness: "codex",
        name: "Server",
        id: "server",
        transport: "stdio",
        command: "server",
        environment: { API_KEY: "secret" },
      },
      {
        agentId: "agent-1",
        harness: "codex",
        id: "server",
        name: "Server",
        transport: "http",
        url: "https://user:password@example.com",
      },
    ])
      expect(() => prepareMcpServerSave(value)).toThrow();
  });
  test("local file operations use the verified active organization", async () => {
    const f = fixture(undefined, [], { agents: [agent] });
    await f.controller.run("synchronize");
    const input = {
      harness: "codex",
      agentId: "agent-1",
      id: "notes",
      name: "Notes",
      description: "",
      content: "Keep notes.",
    };
    await f.controller.run("saveSkill", input);
    expect(f.calls.at(-1)).toEqual({
      method: "saveSkill",
      value: {
        organizationId: "org-1",
        agentId: "agent-1",
        harness: "codex",
        skill: { id: "notes", name: "Notes", description: "", content: "Keep notes." },
      },
    });
    await rejects(
      f.controller.run("deleteSkill", {
        organizationId: "other-org",
        agentId: "agent-1",
        harness: "codex",
        id: "notes",
      }),
      Error,
    );
    expect(f.calls.length).toBe(2);
  });
  test("new configuration uses stable names instead of random database-style IDs", async () => {
    const f = fixture(undefined, [], { agents: [agent] });
    await f.controller.run("synchronize");
    await f.controller.run("saveSkill", {
      harness: "opencode",
      agentId: "agent-1",
      name: "review-context",
      description: "Review context.",
      content: "Read the sources.",
    });
    expect(f.calls.at(-1)?.value).toMatchObject({ skill: { id: "review-context" } });
    await f.controller.run("saveMcpServer", {
      agentId: "agent-1",
      name: "local-helper",
      transport: "stdio",
      command: "node",
      args: ["helper.mjs"],
    });
    expect(f.mcpServers.get("org-1/agent-1")?.map((server) => server.id)).toEqual(["local-helper"]);
  });
  test("MCP servers are stored per agent of the verified organization, not in agent folders", async () => {
    const f = fixture(undefined, [], { agents: [agent] });
    await f.controller.run("synchronize");
    const calls = f.calls.length;
    const server = {
      agentId: "agent-1",
      id: "tools",
      name: "Tools",
      transport: "http",
      url: "https://tools.example/mcp",
    } as const;
    await f.controller.run("saveMcpServer", server);
    await rejects(f.controller.run("saveMcpServer", { ...server, agentId: "agent-2" }));
    await rejects(f.controller.run("saveMcpServer", { ...server, organizationId: "org-2" }));
    expect([...f.mcpServers.entries()]).toEqual([
      [
        "org-1/agent-1",
        [{ id: "tools", name: "Tools", transport: "http", url: "https://tools.example/mcp" }],
      ],
    ]);
    await f.controller.run("deleteMcpServer", { agentId: "agent-1", id: "tools" });
    expect(f.mcpServers.get("org-1/agent-1")).toEqual([]);
    expect(f.calls.length).toBe(calls);
  });
  test("skills, MCP servers and the working folder of an agent homed elsewhere are not read or changed here", async () => {
    const stored: HarnessMcpServer = {
      id: "tools",
      name: "Tools",
      transport: "stdio",
      command: "node",
    };
    const f = fixture(undefined, [stored], { agents: [agent], homedElsewhere: [agent.id] });
    await f.controller.run("synchronize");
    const scope = { harness: "opencode", agentId: agent.id } as const;
    for (const [method, value] of [
      ["scanConfiguration", scope],
      ["saveSkill", { ...scope, name: "notes", description: "", content: "Keep notes." }],
      ["deleteSkill", { ...scope, id: "notes" }],
      ["resetDefaults", scope],
      ["saveMcpServer", { agentId: agent.id, name: "other", transport: "stdio", command: "node" }],
      ["deleteMcpServer", { agentId: agent.id, id: "tools" }],
      ["chooseWorkspace", { agentId: agent.id }],
      ["clearWorkspace", { agentId: agent.id }],
    ] as const)
      await rejects(f.controller.run(method, value), {
        code: "agent-not-home",
        message: "Edit this agent's skills and MCP servers on its home desktop.",
      });
    expect(f.calls.map((call) => call.method)).toEqual(["configure"]);
    expect(f.mcpServers.get("org-1/agent-1")).toEqual([stored]);
  });
  test("a scan returns the folder's skills with the agent's stored MCP servers", async () => {
    const stored: HarnessMcpServer = {
      id: "local-helper",
      name: "local-helper",
      transport: "stdio",
      command: "node",
      args: ["helper.mjs"],
    };
    const f = fixture(undefined, [stored], { agents: [agent] });
    await f.controller.run("synchronize");
    expect(
      await f.controller.run("scanConfiguration", { harness: "codex", agentId: "agent-1" }),
    ).toEqual({
      organizationId: "org-1",
      agentId: "agent-1",
      harness: "codex",
      skills: [],
      mcpServers: [stored],
      workspace: null,
    });
  });
  test("a chosen working folder is stored as its real path and shows in the scan", async () => {
    const accounts = await mkdtemp(join(tmpdir(), "substrate-accounts-"));
    const project = await mkdtemp(join(tmpdir(), "substrate-project-"));
    try {
      const f = fixture(undefined, [], {
        agents: [agent],
        accountsDirectory: accounts,
        pickedWorkspace: project,
      });
      await f.controller.run("synchronize");
      await f.controller.run("chooseWorkspace", { agentId: "agent-1" });
      expect(f.workspaces.get("org-1/agent-1")).toBe(await realpath(project));
      expect(
        await f.controller.run("scanConfiguration", { harness: "codex", agentId: "agent-1" }),
      ).toMatchObject({ workspace: await realpath(project) });
      await f.controller.run("clearWorkspace", { agentId: "agent-1" });
      expect(f.workspaces.has("org-1/agent-1")).toBe(false);
    } finally {
      await rm(accounts, { recursive: true, force: true });
      await rm(project, { recursive: true, force: true });
    }
  });
  test("a cancelled dialog keeps the working folder, and Substrate's own folders are refused", async () => {
    const accounts = await mkdtemp(join(tmpdir(), "substrate-accounts-"));
    try {
      const cancelled = fixture(undefined, [], { agents: [agent], accountsDirectory: accounts });
      await cancelled.controller.run("synchronize");
      cancelled.workspaces.set("org-1/agent-1", "C:\\kept");
      await cancelled.controller.run("chooseWorkspace", { agentId: "agent-1" });
      expect(cancelled.workspaces.get("org-1/agent-1")).toBe("C:\\kept");

      const inside = fixture(undefined, [], {
        agents: [agent],
        accountsDirectory: accounts,
        pickedWorkspace: accounts,
      });
      await inside.controller.run("synchronize");
      await rejects(inside.controller.run("chooseWorkspace", { agentId: "agent-1" }), {
        code: "invalid-workspace",
      });
      expect(inside.workspaces.size).toBe(0);
    } finally {
      await rm(accounts, { recursive: true, force: true });
    }
  });
  test("a scan cannot return private configuration after sign-out", async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scanning = new Promise<void>((resolve) => {
      started = resolve;
    });
    const f = fixture(
      async () => {
        started();
        await gate;
      },
      [],
      { agents: [agent] },
    );
    await f.controller.run("synchronize");
    const result = f.controller.run("scanConfiguration", { harness: "codex", agentId: "agent-1" });
    await scanning;
    f.controller.disconnect();
    release();
    await rejects(result, /Harness unavailable/);
  });
});
