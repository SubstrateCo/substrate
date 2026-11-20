import type { HarnessAgent, HarnessMcpServer } from "@substrate/contracts/harness";

import { prepareLocalInput, prepareMcpServerSave } from "./local-configuration.ts";
import { fixture } from "./test-support.ts";
import { describe, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";

const agent: HarnessAgent = {
  id: "agent-1",
  name: "Agent",
  instructions: "",
  harness: "opencode",
  enabled: true,
  useStartupDefaults: true,
};

describe("desktop harness local configuration", () => {
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
    const f = fixture();
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
  test("a scan returns the folder's skills with the agent's stored MCP servers", async () => {
    const stored: HarnessMcpServer = {
      id: "local-helper",
      name: "local-helper",
      transport: "stdio",
      command: "node",
      args: ["helper.mjs"],
    };
    const f = fixture(undefined, [stored]);
    await f.controller.run("synchronize");
    expect(
      await f.controller.run("scanConfiguration", { harness: "codex", agentId: "agent-1" }),
    ).toEqual({
      organizationId: "org-1",
      agentId: "agent-1",
      harness: "codex",
      skills: [],
      mcpServers: [stored],
    });
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
    const f = fixture(async () => {
      started();
      await gate;
    });
    await f.controller.run("synchronize");
    const result = f.controller.run("scanConfiguration", { harness: "codex", agentId: "agent-1" });
    await scanning;
    f.controller.disconnect();
    release();
    await rejects(result, /Harness unavailable/);
  });
});
