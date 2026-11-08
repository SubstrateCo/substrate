import { HarnessStore } from "@startup-os/client-storage";

import { createDesktopHarnessHost } from "./desktop-harness-host.ts";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("desktop preserves local metadata across host restarts without storing native catalogs", async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "desktop-metadata-test-"));
  const path = join(root, ".startup-os", "harness-metadata.sqlite");
  const host = await createDesktopHarnessHost({ accountDirectory: root });
  const agent = {
    id: "agent-a",
    name: "Agent",
    harness: "opencode" as const,
    instructions: "Agent instructions",
    enabled: true,
    useStartupDefaults: false,
    createdAt: "backend-only",
    skillIds: ["obsolete-cloud-assignment"],
  };
  try {
    await host.configure({ organizationId: "org-a", agents: [agent] });
    await host.saveSkill({
      organizationId: "org-a",
      agentId: "agent-a",
      harness: "opencode",
      skill: {
        id: "local-only",
        name: "local-only",
        description: "Local",
        content: "NATIVE_SKILL_ONLY",
      },
    });
    await host.saveMcpServer({
      organizationId: "org-a",
      agentId: "agent-a",
      harness: "opencode",
      server: {
        id: "local-server",
        name: "local-server",
        transport: "http",
        url: "https://native-only.example/mcp",
      },
    });
    const database = new Database(path, { readonly: true });
    try {
      expect(
        database.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all(),
      ).toEqual([
        { name: "__drizzle_migrations" },
        { name: "configuration_state" },
        { name: "native_session_refs" },
      ]);
      const row = database
        .query<{ configuration: string }, []>("SELECT configuration FROM configuration_state")
        .get();
      expect(row?.configuration).toContain("Agent instructions");
      expect(row?.configuration).not.toContain("backend-only");
      expect(row?.configuration).not.toContain("obsolete-cloud-assignment");
      expect(row?.configuration).not.toContain("NATIVE_SKILL_ONLY");
      expect(row?.configuration).not.toContain("native-only.example");
    } finally {
      database.close();
    }
    await host.dispose();
    const reopened = await createDesktopHarnessHost({ accountDirectory: root });
    try {
      const local = await reopened.scanConfiguration({
        organizationId: "org-a",
        agentId: "agent-a",
        harness: "opencode",
      });
      expect(local.skills.map((skill) => skill.id)).toEqual(["local-only"]);
      expect(local.mcpServers.map((server) => server.id)).toEqual(["local-server"]);
    } finally {
      await reopened.dispose();
    }
    const storage = await HarnessStore.open(path);
    try {
      expect(await storage.configuration("org-a")).toMatchObject({
        agents: [{ id: "agent-a", instructions: "Agent instructions" }],
      });
    } finally {
      storage.close();
    }
  } finally {
    await host.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

for (const target of ["directory", "database"]) {
  test(`desktop rejects a redirected metadata ${target}`, async () => {
    await mkdir(join(tmpdir(), "opencode"), { recursive: true });
    const root = await mkdtemp(join(tmpdir(), "opencode", "desktop-storage-path-test-"));
    const account = join(root, "account");
    const outside = join(root, "outside");
    await mkdir(account);
    await mkdir(outside);
    try {
      if (target === "directory") {
        await symlink(
          outside,
          join(account, ".startup-os"),
          process.platform === "win32" ? "junction" : "dir",
        );
      } else {
        await mkdir(join(account, ".startup-os"));
        await symlink(
          outside,
          join(account, ".startup-os", "harness-metadata.sqlite"),
          process.platform === "win32" ? "junction" : "dir",
        );
      }
      // oxlint-disable-next-line typescript/await-thenable -- Bun rejection assertions return promises at runtime.
      await expect(createDesktopHarnessHost({ accountDirectory: account })).rejects.toThrow(
        "symlinks or junctions",
      );
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
