import { HarnessStore } from "./harness-store.ts";
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { appendFile, cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
    await expect(HarnessStore.open(path, migrations)).rejects.toThrow();
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
  let store = await HarnessStore.open(path);
  try {
    await store.configure({ ...configuration, agents: [] });
    await store.save(ref);
    await store.save({ ...ref, nativeSessionId: "native-updated" });
    await store.configure(configuration);
    store.close();
    store = await HarnessStore.open(path);
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
