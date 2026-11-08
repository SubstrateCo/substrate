import { createHarnessHost } from "./host.ts";
import { MetadataStore } from "./store.ts";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { appendFile, cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("metadata stores agent configuration only, not native skill/MCP catalogs or conversation content", async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "harness-metadata-test-"));
  const host = await createHarnessHost({ accountDirectory: root });
  try {
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
    const database = new Database(join(root, ".startup-os", "harness-metadata.sqlite"), {
      readonly: true,
    });
    try {
      const tables = database
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all();
      expect(tables).toEqual([
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
  } finally {
    await host.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test("a failed migration rolls back its schema and closes the database", async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "harness-migration-test-"));
  const path = join(root, "metadata.sqlite");
  const migrations = join(root, "migrations");
  try {
    await cp(fileURLToPath(new URL("../migrations/", import.meta.url)), migrations, {
      recursive: true,
    });
    const migration = (await readdir(migrations)).find((name) => name.endsWith(".sql"));
    if (!migration) throw new Error("Missing generated metadata migration.");
    await appendFile(join(migrations, migration), "\n--> statement-breakpoint\nINVALID SQL;");
    // oxlint-disable-next-line typescript/await-thenable -- Bun rejection assertions are asynchronous despite their assertion return declarations.
    await expect(MetadataStore.open(path, migrations)).rejects.toThrow();
    const database = new Database(path, { readonly: true });
    try {
      expect(database.query("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([
        { name: "__drizzle_migrations" },
      ]);
      expect(database.query("SELECT hash FROM __drizzle_migrations").all()).toEqual([]);
    } finally {
      database.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("metadata migrations run once and preserve organization-scoped records on reopen", async () => {
  await mkdir(join(tmpdir(), "opencode"), { recursive: true });
  const root = await mkdtemp(join(tmpdir(), "opencode", "harness-store-test-"));
  const path = join(root, "metadata.sqlite");
  const configuration = {
    organizationId: "org-a",
    agents: [
      {
        id: "agent-a",
        name: "Agent",
        harness: "opencode" as const,
        instructions: "Updated instructions",
        enabled: true,
        useStartupDefaults: false,
      },
    ],
  };
  const ref = {
    id: "session-a",
    organizationId: "org-a",
    agentId: "agent-a",
    harness: "opencode" as const,
    nativeSessionId: "native-a",
  };
  let store = await MetadataStore.open(path);
  try {
    await store.configure({ ...configuration, agents: [] });
    await store.save(ref);
    await store.save({ ...ref, nativeSessionId: "native-updated" });
    await store.configure(configuration);
    store.close();
    store = await MetadataStore.open(path);
    expect(await store.configuration("org-a")).toEqual(configuration);
    expect(await store.configuration("org-b")).toBeUndefined();
    expect(await store.session("org-a", ref.id)).toEqual({
      ...ref,
      nativeSessionId: "native-updated",
    });
    expect(await store.session("org-b", ref.id)).toBeUndefined();
    const database = new Database(path, { readonly: true });
    try {
      expect(database.query("SELECT hash FROM __drizzle_migrations").all()).toHaveLength(1);
    } finally {
      database.close();
    }
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
