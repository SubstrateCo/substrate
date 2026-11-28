import { createTestDatabases } from "../../../packages/database/src/testing/databases";

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
