import { createHarnessHost } from "./host.ts";
import { expect, test } from "bun:test";
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
    expect(first.directory).toBe(join(root, "orgs", "org-a", "agent-a"));
    expect(second.directory).toBe(join(root, "orgs", "org-a", "agent-b"));
    expect(first.skills.map((skill) => skill.id)).toEqual(["review"]);
    expect(first.mcpServers.map((server) => server.id)).toEqual(["tools"]);
    expect(second.skills).toEqual([]);
    expect(second.mcpServers).toEqual([]);
    expect(await readdir(second.directory)).not.toContain(".git");
    await host.configure({ organizationId: "org-b", agents: [agent] });
    const otherOrganization = await host.scanConfiguration({ ...scope, organizationId: "org-b" });
    expect(otherOrganization.directory).toBe(join(root, "orgs", "org-b", "agent-a"));
    expect(otherOrganization.skills).toEqual([]);
    expect(otherOrganization.mcpServers).toEqual([]);
    for (const agentId of ["../agent-b", "missing-agent"]) {
      // oxlint-disable-next-line typescript/await-thenable -- Bun rejection assertions return promises at runtime.
      await expect(host.scanConfiguration({ ...scope, agentId })).rejects.toMatchObject({
        code: agentId === "missing-agent" ? "agent-not-found" : "invalid-id",
      });
    }
    await rm(second.directory, { recursive: true });
    await symlink(
      first.directory,
      second.directory,
      process.platform === "win32" ? "junction" : "dir",
    );
    // oxlint-disable-next-line typescript/await-thenable -- Bun rejection assertions return promises at runtime.
    await expect(host.scanConfiguration({ ...scope, agentId: "agent-b" })).rejects.toMatchObject({
      code: "unsafe-path",
    });
  } finally {
    await host.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
