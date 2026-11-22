import { createTestDatabases } from "../../../packages/database/src/testing/databases";

// Server workflow tests reset their database. Give them a private database even when workspace
// tests run beside the database package or use a single database-test shard.
const databases = await createTestDatabases(1);
try {
  const child = Bun.spawn(
    [process.execPath, "test", "--timeout", "30000", "src", "scripts", ...process.argv.slice(2)],
    {
      env: { ...process.env, TEST_DATABASE_URL: databases.connections[0] },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  process.exitCode = await child.exited;
} finally {
  await databases.close();
}
