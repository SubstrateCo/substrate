import { createHarnessHost } from "./host.ts";
import { expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("agents in the same organization have separate working folders and native configuration", async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "agent-directory-test-"));
  const host = await createHarnessHost({ accountDirectory: root });
  const agent = {
    id: "agent-a",
    name: "Agent",
    harness: "opencode" as const,
    instructions: "Work locally",
    enabled: true,
    useStartupDefaults: false,
  };
  const scope = { organizationId: "org-a", agentId: agent.id, harness: agent.harness };
  const secondDirectory = join(root, "orgs", "org-a", "agent-b");
  try {
    await host.configure({
      organizationId: scope.organizationId,
      agents: [agent, { ...agent, id: "agent-b" }],
    });
    await host.saveSkill({
      ...scope,
      skill: { id: "review", name: "review", description: "", content: "Agent A only" },
    });
    await host.saveMcpServer({
      ...scope,
      server: { id: "tools", name: "tools", transport: "http", url: "https://tools.example/mcp" },
    });
    const first = await host.scanConfiguration(scope);
    const second = await host.scanConfiguration({ ...scope, agentId: "agent-b" });
    expect(first.skills.map((skill) => skill.id)).toEqual(["review"]);
    expect(first.mcpServers.map((server) => server.id)).toEqual(["tools"]);
    expect(second.skills).toEqual([]);
    expect(second.mcpServers).toEqual([]);
    expect(
      await Bun.file(
        join(root, "orgs", "org-a", "agent-a", ".opencode", "skills", "review", "SKILL.md"),
      ).exists(),
    ).toBe(true);
    expect(await readdir(secondDirectory)).not.toContain(".git");
    await host.configure({ organizationId: "org-b", agents: [agent] });
    const otherOrganization = await host.scanConfiguration({ ...scope, organizationId: "org-b" });
    expect(await readdir(join(root, "orgs", "org-b"))).toContain("agent-a");
    expect(otherOrganization.skills).toEqual([]);
    expect(otherOrganization.mcpServers).toEqual([]);
    for (const agentId of ["../agent-b", "missing-agent"]) {
      await rejects(host.scanConfiguration({ ...scope, agentId }), {
        code: agentId === "missing-agent" ? "agent-not-found" : "invalid-id",
      });
    }
    await rm(secondDirectory, { recursive: true });
    await symlink(
      join(root, "orgs", "org-a", "agent-a"),
      secondDirectory,
      process.platform === "win32" ? "junction" : "dir",
    );
    await rejects(host.scanConfiguration({ ...scope, agentId: "agent-b" }), {
      code: "unsafe-path",
    });
  } finally {
    await host.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
